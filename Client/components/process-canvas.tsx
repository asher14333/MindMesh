"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  getNodesBounds,
  applyNodeChanges,
  applyEdgeChanges,
  type ReactFlowInstance,
  type Connection,
  type OnNodeDrag,
  type NodeChange,
  type EdgeChange,
  type Node,
  type Edge,
} from "@xyflow/react"
import { useMindMesh, type MindMeshState } from "@/lib/mindmesh/store"
import { MindMeshNode } from "@/components/mindmesh-node"
import type { DiagramNodeData, DiagramEdgeData } from "@/lib/mindmesh/events"
import { Button } from "@/components/ui/button"
import { Plus, MousePointer2 } from "lucide-react"

type RFNode = Node<DiagramNodeData>
type RFEdge = Edge<DiagramEdgeData>

// ─── Remote cursor overlay ──────────────────────────────────────────────────
function RemoteCursors() {
  const { state } = useMindMesh()
  const now = Date.now()
  const cursors = Object.values(state.remoteCursors).filter(
    (c) => now - c.lastSeen < 5000 // Hide stale cursors (5s timeout)
  )

  if (cursors.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {cursors.map((cursor) => (
        <div
          key={cursor.user_id}
          className="absolute transition-all duration-75 ease-out"
          style={{
            transform: `translate(${cursor.position.x}px, ${cursor.position.y}px)`,
          }}
        >
          {/* Cursor arrow */}
          <MousePointer2
            className="h-4 w-4 drop-shadow-sm"
            style={{ color: cursor.color }}
            fill={cursor.color}
          />
          {/* Name label */}
          <div
            className="ml-3 -mt-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.user_name}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Debug Panel ────────────────────────────────────────────────────────────
function DevDebugPanel({
  state,
  connectionState,
  onResetDiagram,
  onRunDemoScript,
}: {
  state: MindMeshState
  connectionState: string
  onResetDiagram: () => boolean
  onRunDemoScript: () => void
}) {
  const last = state.recentEvents[state.recentEvents.length - 1]
  const isConnected = connectionState === "open"

  return (
    <div className="absolute left-4 top-4 z-30 w-[320px] rounded-lg border border-border/60 bg-card/90 p-3 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">MindMesh Debug</span>
        <span>v{state.version}</span>
      </div>
      <div className="mt-2 space-y-1">
        <div>mode: {state.mode}</div>
        <div>diagram: {state.diagramType}</div>
        <div>desynced: {String(state.desynced)}</div>
        <div>last: {last?.summary ?? "none"}</div>
        {state.lastError ? (
          <div className="font-medium text-red-600">error: {state.lastError.message}</div>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-[11px]"
          onClick={onRunDemoScript}
          disabled={!isConnected}
        >
          Run Demo Script
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={onResetDiagram}
          disabled={!isConnected}
        >
          Reset Diagram
        </Button>
      </div>
    </div>
  )
}

// ─── Node type registry ─────────────────────────────────────────────────────
const nodeTypes = {
  default: MindMeshNode,
}

export default function ProcessCanvas() {
  const {
    state,
    connectionState,
    debug,
    updateNode,
    addNode,
    removeNode,
    addEdge: addEdgeAction,
    removeEdge: removeEdgeAction,
    sendCursorPosition,
    sendSelection,
    userId,
  } = useMindMesh()
  const canvasRef = useRef<HTMLDivElement | null>(null)

  // ─── Local React Flow state (properly controlled) ────────────────────────
  // We keep local arrays that React Flow owns for drag/selection/etc.
  // and sync them FROM the store when the store changes.
  const [rfNodes, setRfNodes] = useState<RFNode[]>([])
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([])
  const isDraggingRef = useRef(false)

  // Sync store → React Flow state (skip during active drag to avoid jank)
  const storeNodes = useMemo(() => Object.values(state.nodesById), [state.nodesById])
  const storeEdges = useMemo(() => Object.values(state.edgesById), [state.edgesById])

  useEffect(() => {
    if (isDraggingRef.current) return // don't clobber in-progress drag
    // Inject edit callbacks + remote selection info into node data
    const enriched = storeNodes.map((node) => {
      const remoteSelection = Object.values(state.remoteSelections).find(
        (s) => s.node_id === node.id && s.user_id !== userId
      )
      return {
        ...node,
        data: {
          ...node.data,
          _onUpdateNode: updateNode,
          _onRemoveNode: removeNode,
          _remoteSelectionColor: remoteSelection?.color,
          _remoteSelectionUser: remoteSelection?.user_name,
        },
      }
    })
    setRfNodes(enriched)
  }, [storeNodes, state.remoteSelections, updateNode, removeNode, userId])

  useEffect(() => {
    setRfEdges(storeEdges)
  }, [storeEdges])

  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const lastFitReplaceVersionRef = useRef<number | null>(null)
  const lastExpandedPatchVersionRef = useRef<number | null>(null)

  // ─── Auto-fit on diagram replace ──────────────────────────────────────────
  useEffect(() => {
    if (!rfInstance) return
    if (state.lastReplaceVersion === null) return
    if (lastFitReplaceVersionRef.current === state.lastReplaceVersion) return
    if (storeNodes.length === 0) return

    requestAnimationFrame(() => {
      rfInstance.fitView({ padding: 0.2, duration: 300 })
    })
    lastFitReplaceVersionRef.current = state.lastReplaceVersion
  }, [rfInstance, storeNodes.length, state.lastReplaceVersion])

  // ─── Auto-expand on patch with new nodes ──────────────────────────────────
  useEffect(() => {
    if (!rfInstance) return
    if (!canvasRef.current) return
    if (state.lastAddNodePatchVersion === null) return
    if (lastExpandedPatchVersionRef.current === state.lastAddNodePatchVersion) return
    if (storeNodes.length === 0) return

    requestAnimationFrame(() => {
      const measuredNodes = rfInstance.getNodes()
      if (measuredNodes.length === 0 || !canvasRef.current) return

      const bounds = getNodesBounds(measuredNodes)
      const viewport = rfInstance.getViewport()
      const canvasWidth = canvasRef.current.clientWidth
      const canvasHeight = canvasRef.current.clientHeight
      const left = -viewport.x / viewport.zoom
      const top = -viewport.y / viewport.zoom
      const right = (-viewport.x + canvasWidth) / viewport.zoom
      const bottom = (-viewport.y + canvasHeight) / viewport.zoom
      const needsExpand =
        bounds.x < left ||
        bounds.y < top ||
        bounds.x + bounds.width > right ||
        bounds.y + bounds.height > bottom

      if (needsExpand) {
        rfInstance.fitBounds(bounds, { padding: 0.12, duration: 300 })
      }
      lastExpandedPatchVersionRef.current = state.lastAddNodePatchVersion
    })
  }, [rfInstance, storeNodes.length, state.lastAddNodePatchVersion])

  // ─── React Flow controlled-mode change handlers ──────────────────────────
  // These let React Flow manage internal state (drag positions, selection, etc.)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((nds) => applyNodeChanges(changes, nds) as RFNode[])
    },
    []
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setRfEdges((eds) => applyEdgeChanges(changes, eds) as RFEdge[])
    },
    []
  )

  // ─── Node drag → sync position to store on stop ─────────────────────────
  const onNodeDragStart: OnNodeDrag = useCallback(() => {
    isDraggingRef.current = true
  }, [])

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      isDraggingRef.current = false
      updateNode(node.id, { position: node.position })
    },
    [updateNode]
  )

  // ─── Edge connection (drag from handle to handle) ────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addEdgeAction(connection.source, connection.target)
      }
    },
    [addEdgeAction]
  )

  // ─── Node selection → broadcast ──────────────────────────────────────────
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[]; edges: Edge[] }) => {
      const selectedId = selectedNodes.length === 1 ? selectedNodes[0].id : null
      sendSelection(selectedId)
    },
    [sendSelection]
  )

  // ─── Delete selected nodes/edges via keyboard ────────────────────────────
  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      for (const node of deletedNodes) {
        removeNode(node.id)
      }
    },
    [removeNode]
  )

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        removeEdgeAction(edge.id)
      }
    },
    [removeEdgeAction]
  )

  // ─── Mouse move → broadcast cursor position (throttled ~30fps) ───────────
  const lastCursorSendRef = useRef(0)
  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const now = Date.now()
      if (now - lastCursorSendRef.current < 33) return // ~30fps
      lastCursorSendRef.current = now

      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      sendCursorPosition({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    },
    [sendCursorPosition]
  )

  // ─── Double-click to add node ─────────────────────────────────────────────
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!rfInstance) return
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      addNode(position, { label: "New node", kind: "idea" })
    },
    [rfInstance, addNode]
  )

  // ─── Add node via button ─────────────────────────────────────────────────
  const handleAddNode = useCallback(() => {
    if (!rfInstance || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const position = rfInstance.screenToFlowPosition({
      x: rect.width / 2,
      y: rect.height / 2,
    })
    addNode(position, { label: "New node", kind: "idea" })
  }, [rfInstance, addNode])

  const hasDiagram = rfNodes.length > 0 || rfEdges.length > 0

  const dotClass =
    connectionState === "open"
      ? "bg-emerald-500 animate-pulse"
      : connectionState === "error"
        ? "bg-red-500"
        : "bg-amber-500"

  return (
    <div
      ref={canvasRef}
      className="mindmesh-canvas relative h-full w-full"
      onMouseMove={onMouseMove}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onInit={setRfInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        fitView={false}
        preventScrolling
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onDoubleClick={onPaneDoubleClick}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: "var(--mindmesh-edge)", strokeWidth: 2 }}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { stroke: "var(--mindmesh-edge)", strokeWidth: 1.5 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="var(--mindmesh-grid-dot)"
        />
        <Controls position="bottom-right" />
      </ReactFlow>

      {/* Remote cursors overlay */}
      <RemoteCursors />

      {/* Mode + connection pill */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur-sm">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <span>
          {connectionState === "open"
            ? `${state.mode} • ${state.diagramType} • v${state.version}`
            : `mindmesh ${connectionState}`}
        </span>
        {state.desynced ? <span className="font-medium text-amber-600">desynced</span> : null}
      </div>

      {/* Add node button */}
      <div className="absolute left-4 bottom-4 z-20">
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white/90 text-xs font-medium shadow-sm backdrop-blur-sm hover:bg-slate-50"
          onClick={handleAddNode}
          title="Add a new node (or double-click canvas)"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Node
        </Button>
      </div>

      {/* Connected users count */}
      {Object.keys(state.remoteCursors).length > 0 && (
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {Object.values(state.remoteCursors)
              .filter((c) => Date.now() - c.lastSeen < 5000)
              .slice(0, 5)
              .map((cursor) => (
                <div
                  key={cursor.user_id}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: cursor.color }}
                  title={cursor.user_name}
                >
                  {cursor.user_name.charAt(0).toUpperCase()}
                </div>
              ))}
          </div>
          <span className="text-[10px] font-medium text-slate-400">
            {Object.values(state.remoteCursors).filter((c) => Date.now() - c.lastSeen < 5000).length} online
          </span>
        </div>
      )}

      {/* Empty + desync overlays */}
      {!hasDiagram ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white/92 px-5 py-3 text-sm text-slate-500 shadow-sm backdrop-blur-sm">
            {connectionState === "open"
              ? "Waiting for diagram events… (double-click to add a node)"
              : `Connecting to backend (${connectionState})…`}
          </div>
        </div>
      ) : null}

      {hasDiagram && state.desynced ? (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-6">
          <div className="rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-medium text-amber-600 shadow-sm">
            Out of sync. Waiting for a full diagram replace…
          </div>
        </div>
      ) : null}

      {process.env.NEXT_PUBLIC_MINDMESH_DEBUG === "1" ? (
        <DevDebugPanel
          state={state}
          connectionState={connectionState}
          onResetDiagram={debug.resetDiagram}
          onRunDemoScript={debug.runDemoScript}
        />
      ) : null}
    </div>
  )
}
