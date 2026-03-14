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
  DiagramNode,
  DiagramPatch,
  PatchOp,
  ServerEvent,
  SessionMode,
  StatusEvent,
  TranscriptUpdateEvent,
  IntentResultEvent,
  DiagramType,
} from "@/lib/mindmesh/events"
import { useMindMeshWebSocket, type ConnectionState } from "@/hooks/use-mindmesh-websocket"
import { SAMPLE_SERVER_EVENTS } from "@/lib/mindmesh/sample-events"

type RFNodeData = {
  label: string
  kind?: string
  status?: string | null
}

type RFNode = Node<RFNodeData>
type RFEdge = Edge

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
  lastReplaceVersion: number | null
  recentEvents: RecentEventSummary[]
}

type MindMeshContextValue = {
  state: MindMeshState
  connectionState: ConnectionState
  send: (payload: ClientEvent) => boolean
  debug: {
    reset: () => void
    replaySample: () => void
    injectServerEvent: (event: ServerEvent) => void
  }
}

const MindMeshContext = createContext<MindMeshContextValue | null>(null)

export function useMindMesh() {
  const ctx = useContext(MindMeshContext)
  if (!ctx) throw new Error("useMindMesh must be used within <MindMeshProvider />")
  return ctx
}

const POSITION_SCALE_X = 1.35
const POSITION_SCALE_Y = 1.15

function scalePosition(pos: { x: number; y: number }) {
  return {
    x: pos.x * POSITION_SCALE_X,
    y: pos.y * POSITION_SCALE_Y,
  }
}

function toRFNode(n: DiagramNode): RFNode {
  const pos = scalePosition({ x: n.position?.x ?? 0, y: n.position?.y ?? 0 })
  return {
    id: n.id,
    type: "default",
    className: "mindmesh-node",
    position: {
      x: pos.x,
      y: pos.y,
    },
    targetPosition: HandlePosition.Left,
    sourcePosition: HandlePosition.Right,
    data: {
      label: n.label,
      kind: n.kind,
      status: n.status ?? null,
    },
  }
}

function toRFEdge(e: DiagramEdge): RFEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label ?? undefined,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--mindmesh-edge)" },
    style: { stroke: "var(--mindmesh-edge)", strokeWidth: 1.5 },
  }
}

function summarizeEvent(event: ServerEvent): string {
  switch (event.type) {
    case "status": {
      return `status mode=${event.mode} diagram_type=${event.diagram_type ?? "null"}`
    }
    case "transcript.update": {
      return `transcript.update final=${event.is_final} len=${event.text.length}`
    }
    case "intent.result": {
      const r = event.result
      return `intent ${r.diagram_type} action=${r.action} conf=${r.confidence.toFixed(2)}`
    }
    case "diagram.replace": {
      return `replace v=${event.diagram.version} nodes=${event.diagram.nodes.length} edges=${event.diagram.edges.length}`
    }
    case "diagram.patch": {
      return `patch v=${event.patch.version} ops=${event.patch.ops.length} reason=${event.patch.reason ?? ""}`.trim()
    }
    default: {
      return (event as { type: string }).type
    }
  }
}

function pushRecent(recent: RecentEventSummary[], summary: RecentEventSummary): RecentEventSummary[] {
  const next = recent.length >= 50 ? recent.slice(recent.length - 49) : recent.slice()
  next.push(summary)
  return next
}

function applyReplace(state: MindMeshState, diagram: DiagramDocument): MindMeshState {
  const nodesById: Record<string, RFNode> = {}
  for (const n of diagram.nodes) nodesById[n.id] = toRFNode(n)

  const edgesById: Record<string, RFEdge> = {}
  for (const e of diagram.edges) edgesById[e.id] = toRFEdge(e)

  return {
    ...state,
    desynced: false,
    diagramType: diagram.diagram_type,
    version: diagram.version,
    nodesById,
    edgesById,
    lastReplaceVersion: diagram.version,
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
      const data = op.data as Partial<DiagramNode> & { id: string }
      const id = data.id
      const prev = nodesById[id]

      const hasStatus = Object.prototype.hasOwnProperty.call(data, "status")
      const nextStatus = hasStatus ? (data.status ?? null) : prev?.data?.status ?? null

      const nextData = {
        label: data.label ?? prev?.data?.label ?? id,
        kind: data.kind ?? prev?.data?.kind,
        status: nextStatus,
      }

      nodesById[id] = {
        id,
        type: prev?.type ?? "default",
        className: prev?.className ?? "mindmesh-node",
        position: data.position
          ? scalePosition({ x: data.position.x, y: data.position.y })
          : prev?.position ?? { x: 0, y: 0 },
        targetPosition: prev?.targetPosition ?? HandlePosition.Left,
        sourcePosition: prev?.sourcePosition ?? HandlePosition.Right,
        data: nextData,
      }
      return
    }
    case "remove_node": {
      const id = (op.data as { id: string }).id
      delete nodesById[id]
      for (const [edgeId, e] of Object.entries(edgesById)) {
        if (e.source === id || e.target === id) delete edgesById[edgeId]
      }
      return
    }
    case "add_edge":
    case "update_edge": {
      const data = op.data as Partial<DiagramEdge> & { id: string }
      const id = data.id
      const prev = edgesById[id]

      // For add_edge, backend should provide source/target. If missing, we keep previous.
      const hasLabel = Object.prototype.hasOwnProperty.call(data, "label")
      edgesById[id] = {
        id,
        type: prev?.type ?? "smoothstep",
        source: data.source ?? prev?.source ?? "",
        target: data.target ?? prev?.target ?? "",
        label: hasLabel ? (data.label ?? undefined) : prev?.label,
        markerEnd: prev?.markerEnd ?? { type: MarkerType.ArrowClosed, color: "var(--mindmesh-edge)" },
        style: prev?.style ?? { stroke: "var(--mindmesh-edge)", strokeWidth: 1.5 },
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
  // Once we're desynced, we only recover via a full replace.
  if (state.desynced) return state

  if (patch.version !== state.version + 1) {
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
  }
}

type Action =
  | { type: "server.event"; event: ServerEvent }
  | { type: "debug.reset" }

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
  lastReplaceVersion: null,
  recentEvents: [],
}

function reducer(state: MindMeshState, action: Action): MindMeshState {
  if (action.type === "debug.reset") return initialState

  const { event } = action

  const withRecent = {
    ...state,
    recentEvents: pushRecent(state.recentEvents, {
      at: Date.now(),
      summary: summarizeEvent(event),
    }),
  }

  switch (event.type) {
    case "status": {
      return {
        ...withRecent,
        lastStatus: event,
        mode: event.mode,
        diagramType: event.diagram_type ?? withRecent.diagramType,
      }
    }
    case "transcript.update": {
      return { ...withRecent, lastTranscript: event }
    }
    case "intent.result": {
      return { ...withRecent, lastIntent: event }
    }
    case "diagram.replace": {
      return applyReplace(withRecent, event.diagram)
    }
    case "diagram.patch": {
      return applyPatch(withRecent, event.patch)
    }
  }
}

type ProviderProps = {
  sessionId: string
  meetingTitle?: string
  children: React.ReactNode
}

export function MindMeshProvider({ sessionId, meetingTitle, children }: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const injectServerEvent = useCallback((event: ServerEvent) => {
    if (event.type === "diagram.patch" || event.type === "diagram.replace") {
      startTransition(() => dispatch({ type: "server.event", event }))
      return
    }
    dispatch({ type: "server.event", event })
  }, [])

  const isMockMode = process.env.NEXT_PUBLIC_MINDMESH_MOCK === "1"

  const replayTimersRef = useRef<number[]>([])
  const clearReplayTimers = useCallback(() => {
    for (const t of replayTimersRef.current) window.clearTimeout(t)
    replayTimersRef.current = []
  }, [])

  const reset = useCallback(() => {
    clearReplayTimers()
    dispatch({ type: "debug.reset" })
  }, [clearReplayTimers])

  const replaySample = useCallback(() => {
    reset()

    let delayMs = 50
    for (const event of SAMPLE_SERVER_EVENTS) {
      const t = window.setTimeout(() => injectServerEvent(event), delayMs)
      replayTimersRef.current.push(t)
      // Slightly slower spacing for diagram events so you can see patching happen.
      delayMs += event.type.startsWith("diagram.") ? 700 : 250
    }
  }, [injectServerEvent, reset])

  const { connectionState, send } = useMindMeshWebSocket({
    sessionId,
    enabled: !isMockMode,
    onServerEvent: injectServerEvent,
    onOpen: (sendNow) => {
      // Minimal commands to make the demo pipeline actually emit diagram events.
      sendNow({ type: "session.start", meeting_title: meetingTitle ?? "MindMesh Demo" })
      sendNow({
        type: "ui.command",
        command: "visualize.toggle",
        payload: { enabled: true },
      })
    },
  })

  // In mock mode, auto-replay once on mount.
  useEffect(() => {
    if (!isMockMode) return
    replaySample()
    return () => clearReplayTimers()
  }, [clearReplayTimers, isMockMode, replaySample])

  const value = useMemo<MindMeshContextValue>(
    () => ({
      state,
      connectionState: isMockMode ? "open" : connectionState,
      send,
      debug: {
        reset,
        replaySample,
        injectServerEvent,
      },
    }),
    [state, connectionState, injectServerEvent, isMockMode, replaySample, reset, send]
  )

  return <MindMeshContext.Provider value={value}>{children}</MindMeshContext.Provider>
}
