"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  getNodesBounds,
  type ReactFlowInstance,
} from "@xyflow/react"
import { useMindMesh, type MindMeshState } from "@/lib/mindmesh/store"
import { Button } from "@/components/ui/button"

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
  const lastIntent = state.lastIntent?.result
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
        {lastIntent ? (
          <>
            <div>intent source: {lastIntent.source}</div>
            <div>intent scope: {lastIntent.scope_relation}</div>
            <div>intent trigger: {lastIntent.trigger_reason ?? "n/a"}</div>
            <div>intent latency: {lastIntent.latency_ms ?? 0} ms</div>
          </>
        ) : null}
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

export default function ProcessCanvas() {
  const { state, connectionState, debug } = useMindMesh()
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const nodes = useMemo(() => Object.values(state.nodesById), [state.nodesById])
  const edges = useMemo(() => Object.values(state.edgesById), [state.edgesById])

  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const lastFitReplaceVersionRef = useRef<number | null>(null)
  const lastExpandedPatchVersionRef = useRef<number | null>(null)

  useEffect(() => {
    if (!rfInstance) return
    if (state.lastReplaceVersion === null) return
    if (lastFitReplaceVersionRef.current === state.lastReplaceVersion) return
    if (nodes.length === 0) return

    // Fit only once per replace (not per patch) to avoid viewport thrash.
    requestAnimationFrame(() => {
      rfInstance.fitView({ padding: 0.2, duration: 300 })
    })
    lastFitReplaceVersionRef.current = state.lastReplaceVersion
  }, [rfInstance, nodes.length, state.lastReplaceVersion])

  useEffect(() => {
    if (!rfInstance) return
    if (!canvasRef.current) return
    if (state.lastAddNodePatchVersion === null) return
    if (lastExpandedPatchVersionRef.current === state.lastAddNodePatchVersion) return
    if (nodes.length === 0) return

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
  }, [rfInstance, nodes.length, state.lastAddNodePatchVersion])

  const hasDiagram = nodes.length > 0 || edges.length > 0

  const dotClass =
    connectionState === "open"
      ? "bg-emerald-500 animate-pulse"
      : connectionState === "error"
        ? "bg-red-500"
        : "bg-amber-500"

  return (
    <div ref={canvasRef} className="mindmesh-canvas relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={setRfInstance}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="var(--mindmesh-grid-dot)"
        />
        <Controls position="bottom-right" />
      </ReactFlow>

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

      {/* Empty + desync overlays */}
      {!hasDiagram ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
<div className="rounded-2xl border border-slate-200 bg-white/92 px-5 py-3 text-sm text-slate-500 shadow-sm backdrop-blur-sm">
            {connectionState === "open"
              ? "Waiting for diagram events…"
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
