"use client"

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react"
import { MarkerType, Position as HandlePosition, type Edge, type Node } from "@xyflow/react"
import type {
  ClientEvent,
  DiagramDocument,
  DiagramEdge,
  DiagramEdgeData,
  DiagramNode,
  DiagramNodeData,
  DiagramPatch,
  ErrorEvent,
  PatchOp,
  ServerEvent,
  SessionMode,
  StatusEvent,
  TranscriptUpdateEvent,
  IntentResultEvent,
  DiagramType,
} from "@/lib/mindmesh/events"
import { useMindMeshWebSocket, type ConnectionState } from "@/hooks/use-mindmesh-websocket"

type RFNode = Node<DiagramNodeData>
type RFEdge = Edge<DiagramEdgeData>

type RecentEventSummary = {
  at: number
  summary: string
}

export type MindMeshState = {
  mode: SessionMode
  diagramType: DiagramType
  version: number
  nodesById: Record<string, RFNode>
  edgesById: Record<string, RFEdge>
  desynced: boolean
  lastStatus: StatusEvent | null
  lastIntent: IntentResultEvent | null
  lastTranscript: TranscriptUpdateEvent | null
  lastError: ErrorEvent | null
  lastReplaceVersion: number | null
  lastAddNodePatchVersion: number | null
  recentEvents: RecentEventSummary[]
}

type MindMeshContextValue = {
  state: MindMeshState
  connectionState: ConnectionState
  send: (payload: ClientEvent) => boolean
  debug: {
    resetDiagram: () => boolean
    runDemoScript: () => void
  }
}

const MindMeshContext = createContext<MindMeshContextValue | null>(null)

const DEMO_TRANSCRIPT_LINES = [
  "First sales hands off the deal to solutions engineering.",
  "Then security reviews the integration requirements.",
  "After security sign-off, legal approves the MSA.",
  "Finally provisioning starts and customer success is notified.",
]

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function normalizeNodeData(
  base: Partial<DiagramNodeData> | undefined,
  patch: Partial<DiagramNodeData> | undefined,
  legacy: { label?: string; kind?: string; status?: string | null } = {}
): DiagramNodeData {
  const next = {
    ...base,
    ...patch,
    ...(legacy.label !== undefined ? { label: legacy.label } : {}),
    ...(legacy.kind !== undefined ? { kind: legacy.kind } : {}),
    ...(legacy.status !== undefined ? { status: legacy.status } : {}),
  }

  return {
    label: next.label ?? "Untitled step",
    kind: next.kind ?? "step",
    status: next.status ?? null,
    description: next.description ?? null,
    lane: next.lane ?? null,
    actor: next.actor ?? null,
    time_label: next.time_label ?? null,
    confidence: next.confidence ?? null,
    source_span: next.source_span ?? null,
    metadata: next.metadata ?? {},
  }
}

function toRFNode(node: DiagramNode): RFNode {
  return {
    ...node,
    type: node.type ?? "default",
    className: "mindmesh-node",
    hidden: node.hidden ?? false,
    parentId: node.parentId ?? undefined,
    position: node.position ?? { x: 0, y: 0 },
    targetPosition: HandlePosition.Left,
    sourcePosition: HandlePosition.Right,
    data: normalizeNodeData(undefined, node.data),
  }
}

function toRFEdge(edge: DiagramEdge): RFEdge {
  return {
    ...edge,
    type: edge.type === "default" ? "smoothstep" : edge.type,
    hidden: edge.hidden ?? false,
    animated: edge.animated ?? false,
    label: edge.label ?? undefined,
    data: edge.data ?? {},
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--mindmesh-edge)" },
    style: { stroke: "var(--mindmesh-edge)", strokeWidth: 1.5 },
  }
}

function summarizeEvent(event: ServerEvent): string {
  switch (event.type) {
    case "status":
      return `status mode=${event.mode} diagram_type=${event.diagram_type ?? "null"}`
    case "transcript.update":
      return `transcript.update final=${event.is_final} len=${event.text.length}`
    case "intent.result": {
      const result = event.result
      return `intent ${result.diagram_type} action=${result.action} conf=${result.confidence.toFixed(2)}`
    }
    case "diagram.replace":
      return `replace v=${event.diagram.version} nodes=${event.diagram.nodes.length} edges=${event.diagram.edges.length}`
    case "diagram.patch":
      return `patch v=${event.patch.version} base=${event.patch.base_version} ops=${event.patch.ops.length}`
    case "error":
      return `error ${event.message}`
  }
}

function pushRecent(recent: RecentEventSummary[], summary: RecentEventSummary): RecentEventSummary[] {
  const next = recent.length >= 50 ? recent.slice(recent.length - 49) : recent.slice()
  next.push(summary)
  return next
}

function applyReplace(state: MindMeshState, diagram: DiagramDocument): MindMeshState {
  const nodesById: Record<string, RFNode> = {}
  for (const node of diagram.nodes) nodesById[node.id] = toRFNode(node)

  const edgesById: Record<string, RFEdge> = {}
  for (const edge of diagram.edges) edgesById[edge.id] = toRFEdge(edge)

  return {
    ...state,
    desynced: false,
    diagramType: diagram.diagram_type,
    version: diagram.version,
    nodesById,
    edgesById,
    lastReplaceVersion: diagram.version,
    lastAddNodePatchVersion: null,
  }
}

function applyPatchOp(
  nodesById: Record<string, RFNode>,
  edgesById: Record<string, RFEdge>,
  op: PatchOp
) {
  switch (op.op) {
    case "add_node":
    case "update_node": {
      const data = op.data as Partial<DiagramNode> & {
        id: string
        label?: string
        kind?: string
        status?: string | null
      }
      const previous = nodesById[data.id]
      const nextData = normalizeNodeData(previous?.data, data.data, {
        label: data.label,
        kind: data.kind,
        status: data.status,
      })

      nodesById[data.id] = {
        ...previous,
        id: data.id,
        type: data.type ?? previous?.type ?? "default",
        className: previous?.className ?? "mindmesh-node",
        position: data.position ?? previous?.position ?? { x: 0, y: 0 },
        hidden: hasOwn(data, "hidden") ? Boolean(data.hidden) : (previous?.hidden ?? false),
        parentId: hasOwn(data, "parentId")
          ? data.parentId ?? undefined
          : previous?.parentId,
        sourcePosition: previous?.sourcePosition ?? HandlePosition.Right,
        targetPosition: previous?.targetPosition ?? HandlePosition.Left,
        data: nextData,
      }
      return
    }
    case "remove_node": {
      const id = (op.data as { id: string }).id
      delete nodesById[id]
      for (const [edgeId, edge] of Object.entries(edgesById)) {
        if (edge.source === id || edge.target === id) delete edgesById[edgeId]
      }
      return
    }
    case "add_edge":
    case "update_edge": {
      const data = op.data as Partial<DiagramEdge> & { id: string }
      const previous = edgesById[data.id]
      const nextData = {
        ...(previous?.data ?? {}),
        ...(data.data ?? {}),
      }

      edgesById[data.id] = {
        ...previous,
        id: data.id,
        source: data.source ?? previous?.source ?? "",
        target: data.target ?? previous?.target ?? "",
        type: data.type
          ? data.type === "default"
            ? "smoothstep"
            : data.type
          : (previous?.type ?? "smoothstep"),
        hidden: hasOwn(data, "hidden") ? Boolean(data.hidden) : (previous?.hidden ?? false),
        animated: hasOwn(data, "animated") ? Boolean(data.animated) : (previous?.animated ?? false),
        label: hasOwn(data, "label") ? (data.label ?? undefined) : previous?.label,
        data: nextData,
        markerEnd: previous?.markerEnd ?? { type: MarkerType.ArrowClosed, color: "var(--mindmesh-edge)" },
        style: previous?.style ?? { stroke: "var(--mindmesh-edge)", strokeWidth: 1.5 },
      }
      return
    }
    case "remove_edge": {
      const id = (op.data as { id: string }).id
      delete edgesById[id]
      return
    }
  }
}

function applyPatch(state: MindMeshState, patch: DiagramPatch): MindMeshState {
  if (state.desynced) return state
  if (patch.base_version !== state.version) {
    return { ...state, desynced: true }
  }

  const nodesById = { ...state.nodesById }
  const edgesById = { ...state.edgesById }

  for (const op of patch.ops) applyPatchOp(nodesById, edgesById, op)

  return {
    ...state,
    diagramType: patch.diagram_type,
    version: patch.version,
    nodesById,
    edgesById,
    lastAddNodePatchVersion: patch.ops.some((op) => op.op === "add_node")
      ? patch.version
      : state.lastAddNodePatchVersion,
  }
}

type Action = { type: "server.event"; event: ServerEvent }

const initialState: MindMeshState = {
  mode: "standby",
  diagramType: "none",
  version: 0,
  nodesById: {},
  edgesById: {},
  desynced: false,
  lastStatus: null,
  lastIntent: null,
  lastTranscript: null,
  lastError: null,
  lastReplaceVersion: null,
  lastAddNodePatchVersion: null,
  recentEvents: [],
}

function reducer(state: MindMeshState, action: Action): MindMeshState {
  const { event } = action
  const withRecent = {
    ...state,
    recentEvents: pushRecent(state.recentEvents, {
      at: Date.now(),
      summary: summarizeEvent(event),
    }),
  }

  switch (event.type) {
    case "status":
      return {
        ...withRecent,
        lastStatus: event,
        mode: event.mode,
        diagramType: event.diagram_type ?? withRecent.diagramType,
      }
    case "transcript.update":
      return {
        ...withRecent,
        lastTranscript: event,
      }
    case "intent.result":
      return {
        ...withRecent,
        lastIntent: event,
      }
    case "diagram.replace":
      return applyReplace(withRecent, event.diagram)
    case "diagram.patch":
      return applyPatch(withRecent, event.patch)
    case "error":
      return {
        ...withRecent,
        lastError: event,
      }
  }
}

type ProviderProps = {
  sessionId: string
  meetingTitle?: string
  visualizingEnabled: boolean
  children: React.ReactNode
}

export function useMindMesh() {
  const ctx = useContext(MindMeshContext)
  if (!ctx) throw new Error("useMindMesh must be used within <MindMeshProvider />")
  return ctx
}

export function MindMeshProvider({
  sessionId,
  meetingTitle,
  visualizingEnabled,
  children,
}: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const demoTimersRef = useRef<number[]>([])
  const requestedVisualizingRef = useRef(false)

  const onServerEvent = useCallback((event: ServerEvent) => {
    if (event.type === "diagram.patch" || event.type === "diagram.replace") {
      startTransition(() => dispatch({ type: "server.event", event }))
      return
    }
    dispatch({ type: "server.event", event })
  }, [])

  const clearDemoTimers = useCallback(() => {
    for (const timer of demoTimersRef.current) window.clearTimeout(timer)
    demoTimersRef.current = []
  }, [])

  const { connectionState, send } = useMindMeshWebSocket({
    sessionId,
    enabled: true,
    onServerEvent,
    onOpen: (sendNow) => {
      requestedVisualizingRef.current = false
      sendNow({
        type: "session.start",
        meeting_title: meetingTitle ?? "MindMesh Demo",
      })
    },
  })

  useEffect(() => {
    if (connectionState !== "open") {
      requestedVisualizingRef.current = false
      return
    }

    if (!visualizingEnabled || requestedVisualizingRef.current) return

    if (
      send({
        type: "ui.command",
        command: "visualize.toggle",
        payload: { enabled: true },
      })
    ) {
      requestedVisualizingRef.current = true
    }
  }, [connectionState, send, visualizingEnabled])

  useEffect(() => () => clearDemoTimers(), [clearDemoTimers])

  const resetDiagram = useCallback(() => {
    clearDemoTimers()
    return send({
      type: "ui.command",
      command: "diagram.reset",
      payload: {},
    })
  }, [clearDemoTimers, send])

  const runDemoScript = useCallback(() => {
    if (connectionState !== "open") return

    clearDemoTimers()
    send({
      type: "ui.command",
      command: "visualize.toggle",
      payload: { enabled: true },
    })

    let delayMs = 200
    for (const line of DEMO_TRANSCRIPT_LINES) {
      const timer = window.setTimeout(() => {
        send({ type: "speech.final", text: line })
      }, delayMs)
      demoTimersRef.current.push(timer)
      delayMs += 1000
    }
  }, [clearDemoTimers, connectionState, send])

  const value = useMemo<MindMeshContextValue>(
    () => ({
      state,
      connectionState,
      send,
      debug: {
        resetDiagram,
        runDemoScript,
      },
    }),
    [connectionState, resetDiagram, runDemoScript, send, state]
  )

  return <MindMeshContext.Provider value={value}>{children}</MindMeshContext.Provider>
}
