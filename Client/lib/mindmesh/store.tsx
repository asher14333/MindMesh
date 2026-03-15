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
  CanvasEditOp,
  ClientEvent,
  CollabCursorEvent,
  CollabEditEvent,
  CollabSelectionEvent,
  DiagramDocument,
  DiagramEdge,
  DiagramEdgeData,
  DiagramNode,
  DiagramNodeData,
  DiagramPatch,
  ErrorEvent,
  PatchOp,
  ServerEvent,
  SessionInfoEvent,
  SessionMode,
  StatusEvent,
  TranscriptUpdateEvent,
  TranscriptionToggleEvent,
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

export type RemoteCursor = {
  user_id: string
  user_name: string
  position: { x: number; y: number }
  color: string
  lastSeen: number
}

export type RemoteSelection = {
  user_id: string
  user_name: string
  node_id: string | null
  color: string
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
  // Collaboration state
  remoteCursors: Record<string, RemoteCursor>
  remoteSelections: Record<string, RemoteSelection>
  // Track which nodes were user-edited (don't let AI override)
  userEditedNodeIds: Set<string>
  // Shared transcription state
  isTranscribing: boolean
  transcriptionToggledBy: string | null
  // Shared session start time (epoch ms) — synced from backend so all clients agree
  sessionStartedAt: number
}

type MindMeshContextValue = {
  state: MindMeshState
  connectionState: ConnectionState
  send: (payload: ClientEvent) => boolean
  debug: {
    resetDiagram: () => boolean
    runDemoScript: () => void
  }
  // Canvas edit actions
  updateNode: (id: string, changes: Partial<DiagramNodeData> & { position?: { x: number; y: number } }) => void
  addNode: (position: { x: number; y: number }, data?: Partial<DiagramNodeData>) => void
  removeNode: (id: string) => void
  addEdge: (source: string, target: string) => void
  removeEdge: (id: string) => void
  // Collab actions
  sendCursorPosition: (position: { x: number; y: number }) => void
  sendSelection: (nodeId: string | null) => void
  userId: string
  userColor: string
  // Transcription
  toggleTranscription: () => void
  // Session info
  sessionStartedAt: number
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
  if (!event || typeof event !== "object" || !("type" in event)) return "unknown"
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
    case "collab.cursor":
      return `collab.cursor user=${event.user_id}`
    case "collab.selection":
      return `collab.selection user=${event.user_id}`
    case "collab.edit":
      return `collab.edit ops=${event.ops.length}`
    case "transcription.toggle":
      return `transcription.toggle enabled=${event.enabled} by=${event.user_name}`
    case "session.info":
      return `session.info started_at=${event.started_at}`
    default:
      return `unknown event`
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

type Action =
  | { type: "server.event"; event: ServerEvent }
  | { type: "local.update_node"; id: string; changes: Partial<DiagramNodeData> & { position?: { x: number; y: number } } }
  | { type: "local.add_node"; node: RFNode }
  | { type: "local.remove_node"; id: string }
  | { type: "local.add_edge"; edge: RFEdge }
  | { type: "local.remove_edge"; id: string }
  | { type: "collab.cursor"; cursor: RemoteCursor }
  | { type: "collab.selection"; selection: RemoteSelection }
  | { type: "collab.edit"; ops: CanvasEditOp[] }

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
  remoteCursors: {},
  remoteSelections: {},
  userEditedNodeIds: new Set(),
  isTranscribing: false,
  transcriptionToggledBy: null,
  sessionStartedAt: Date.now(),  // fallback until server sends session.info
}

function applyCanvasEditOp(
  nodesById: Record<string, RFNode>,
  edgesById: Record<string, RFEdge>,
  op: CanvasEditOp
) {
  // Defensive: raw ops from WebSocket might not match TS types exactly
  if (!op || typeof op !== "object" || !op.op) return

  try {
    switch (op.op) {
      case "update_node": {
        const existing = nodesById[op.id]
        if (!existing) return
        const changes = op.changes ?? {}
        nodesById[op.id] = {
          ...existing,
          position: changes.position ?? existing.position,
          data: normalizeNodeData(existing.data, changes),
        }
        return
      }
      case "add_node": {
        nodesById[op.id] = {
          id: op.id,
          type: "default",
          className: "mindmesh-node",
          position: op.position ?? { x: 0, y: 0 },
          hidden: false,
          sourcePosition: HandlePosition.Right,
          targetPosition: HandlePosition.Left,
          data: normalizeNodeData(undefined, op.data),
        }
        return
      }
      case "remove_node": {
        delete nodesById[op.id]
        // Remove connected edges
        for (const [edgeId, edge] of Object.entries(edgesById)) {
          if (edge.source === op.id || edge.target === op.id) {
            delete edgesById[edgeId]
          }
        }
        return
      }
      case "add_edge": {
        edgesById[op.id] = {
          id: op.id,
          source: op.source,
          target: op.target,
          type: "smoothstep",
          animated: false,
          data: {},
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--mindmesh-edge)" },
          style: { stroke: "var(--mindmesh-edge)", strokeWidth: 1.5 },
        }
        return
      }
      case "remove_edge": {
        delete edgesById[op.id]
        return
      }
    }
  } catch (err) {
    console.warn("[MindMesh] applyCanvasEditOp failed for op:", op, err)
  }
}

function reducer(state: MindMeshState, action: Action): MindMeshState {
  // Handle local canvas edits
  if (action.type === "local.update_node") {
    const nodesById = { ...state.nodesById }
    const existing = nodesById[action.id]
    if (!existing) return state
    nodesById[action.id] = {
      ...existing,
      position: action.changes.position ?? existing.position,
      data: normalizeNodeData(existing.data, action.changes),
    }
    const userEditedNodeIds = new Set(state.userEditedNodeIds)
    userEditedNodeIds.add(action.id)
    return { ...state, nodesById, userEditedNodeIds }
  }

  if (action.type === "local.add_node") {
    const nodesById = { ...state.nodesById }
    nodesById[action.node.id] = action.node
    return { ...state, nodesById }
  }

  if (action.type === "local.remove_node") {
    const nodesById = { ...state.nodesById }
    const edgesById = { ...state.edgesById }
    delete nodesById[action.id]
    for (const [edgeId, edge] of Object.entries(edgesById)) {
      if (edge.source === action.id || edge.target === action.id) {
        delete edgesById[edgeId]
      }
    }
    const userEditedNodeIds = new Set(state.userEditedNodeIds)
    userEditedNodeIds.delete(action.id)
    return { ...state, nodesById, edgesById, userEditedNodeIds }
  }

  if (action.type === "local.add_edge") {
    const edgesById = { ...state.edgesById }
    edgesById[action.edge.id] = action.edge
    return { ...state, edgesById }
  }

  if (action.type === "local.remove_edge") {
    const edgesById = { ...state.edgesById }
    delete edgesById[action.id]
    return { ...state, edgesById }
  }

  // Handle collab cursor updates
  if (action.type === "collab.cursor") {
    return {
      ...state,
      remoteCursors: {
        ...state.remoteCursors,
        [action.cursor.user_id]: action.cursor,
      },
    }
  }

  // Handle collab selection updates
  if (action.type === "collab.selection") {
    return {
      ...state,
      remoteSelections: {
        ...state.remoteSelections,
        [action.selection.user_id]: action.selection,
      },
    }
  }

  // Handle remote collab edits
  if (action.type === "collab.edit") {
    const nodesById = { ...state.nodesById }
    const edgesById = { ...state.edgesById }
    for (const op of action.ops) {
      applyCanvasEditOp(nodesById, edgesById, op)
    }
    return { ...state, nodesById, edgesById }
  }

  // Server events
  const { event } = action
  if (!("type" in event)) return state

  // Handle collaboration server events
  if (event.type === "collab.cursor") {
    return {
      ...state,
      remoteCursors: {
        ...state.remoteCursors,
        [event.user_id]: {
          user_id: event.user_id,
          user_name: event.user_name,
          position: event.position,
          color: event.color,
          lastSeen: Date.now(),
        },
      },
    }
  }

  if (event.type === "collab.selection") {
    return {
      ...state,
      remoteSelections: {
        ...state.remoteSelections,
        [event.user_id]: {
          user_id: event.user_id,
          user_name: event.user_name,
          node_id: event.node_id,
          color: event.color,
        },
      },
    }
  }

  if (event.type === "collab.edit") {
    const nodesById = { ...state.nodesById }
    const edgesById = { ...state.edgesById }
    for (const op of (event as CollabEditEvent).ops) {
      applyCanvasEditOp(nodesById, edgesById, op)
    }
    return { ...state, nodesById, edgesById }
  }

  if (event.type === "transcription.toggle") {
    return {
      ...state,
      isTranscribing: (event as TranscriptionToggleEvent).enabled,
      transcriptionToggledBy: (event as TranscriptionToggleEvent).user_name,
    }
  }

  if (event.type === "session.info") {
    return {
      ...state,
      sessionStartedAt: (event as SessionInfoEvent).started_at,
    }
  }

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
    default:
      return state
  }
}

// ─── Collaboration helpers ──────────────────────────────────────────────────
const COLLAB_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316",
]

function makeUserId() {
  return `user-${Math.random().toString(36).slice(2, 8)}`
}

function pickColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length]
}

const STABLE_USER_ID = typeof window !== "undefined"
  ? (sessionStorage.getItem("mm-collab-user-id") || (() => { const id = makeUserId(); sessionStorage.setItem("mm-collab-user-id", id); return id })())
  : makeUserId()

type ProviderProps = {
  sessionId: string
  meetingTitle?: string
  visualizingEnabled: boolean
  children: React.ReactNode
  userName?: string
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
  userName,
}: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const demoTimersRef = useRef<number[]>([])
  const requestedVisualizingRef = useRef(false)

  const userId = STABLE_USER_ID
  const userColor = useMemo(() => pickColor(userId), [userId])
  const displayName = userName || (typeof window !== "undefined" ? sessionStorage.getItem("mm-display-name") : null) || "You"

  const onServerEvent = useCallback((event: ServerEvent) => {
    if (!event || typeof event !== "object" || !("type" in event)) return

    // Handle collab events + transcription toggle + session info
    if (event.type === "collab.cursor" || event.type === "collab.selection" || event.type === "collab.edit" || event.type === "transcription.toggle" || event.type === "session.info") {
      dispatch({ type: "server.event", event })
      return
    }

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

  // ─── Canvas edit actions ────────────────────────────────────────────────────
  const updateNode = useCallback(
    (id: string, changes: Partial<DiagramNodeData> & { position?: { x: number; y: number } }) => {
      dispatch({ type: "local.update_node", id, changes })
      send({ type: "canvas.edit", ops: [{ op: "update_node", id, changes }] })
    },
    [send]
  )

  const addNode = useCallback(
    (position: { x: number; y: number }, data?: Partial<DiagramNodeData>) => {
      const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const nodeData = normalizeNodeData(undefined, data)
      const node: RFNode = {
        id,
        type: "default",
        className: "mindmesh-node",
        position,
        hidden: false,
        sourcePosition: HandlePosition.Right,
        targetPosition: HandlePosition.Left,
        data: nodeData,
      }
      dispatch({ type: "local.add_node", node })
      send({ type: "canvas.edit", ops: [{ op: "add_node", id, position, data: nodeData }] })
    },
    [send]
  )

  const removeNode = useCallback(
    (id: string) => {
      dispatch({ type: "local.remove_node", id })
      send({ type: "canvas.edit", ops: [{ op: "remove_node", id }] })
    },
    [send]
  )

  const addEdge = useCallback(
    (source: string, target: string) => {
      const id = `edge-${source}-${target}-${Date.now()}`
      const edge: RFEdge = {
        id,
        source,
        target,
        type: "smoothstep",
        animated: false,
        data: {},
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--mindmesh-edge)" },
        style: { stroke: "var(--mindmesh-edge)", strokeWidth: 1.5 },
      }
      dispatch({ type: "local.add_edge", edge })
      send({ type: "canvas.edit", ops: [{ op: "add_edge", id, source, target }] })
    },
    [send]
  )

  const removeEdge = useCallback(
    (id: string) => {
      dispatch({ type: "local.remove_edge", id })
      send({ type: "canvas.edit", ops: [{ op: "remove_edge", id }] })
    },
    [send]
  )

  // ─── Transcription toggle (shared across all users) ─────────────────────
  const toggleTranscription = useCallback(() => {
    const newEnabled = !state.isTranscribing
    send({
      type: "transcription.toggle",
      enabled: newEnabled,
      user_id: userId,
      user_name: displayName,
    })
    // Also update local state immediately for responsiveness
    dispatch({
      type: "server.event",
      event: {
        type: "transcription.toggle",
        enabled: newEnabled,
        user_id: userId,
        user_name: displayName,
      },
    })
  }, [send, state.isTranscribing, userId, displayName])

  // ─── Collaboration actions ────────────────────────────────────────────────
  const sendCursorPosition = useCallback(
    (position: { x: number; y: number }) => {
      send({
        type: "collab.cursor",
        user_id: userId,
        user_name: displayName,
        position,
        color: userColor,
      })
    },
    [send, userId, displayName, userColor]
  )

  const sendSelection = useCallback(
    (nodeId: string | null) => {
      send({
        type: "collab.selection",
        user_id: userId,
        user_name: displayName,
        node_id: nodeId,
        color: userColor,
      })
    },
    [send, userId, displayName, userColor]
  )

  const value = useMemo<MindMeshContextValue>(
    () => ({
      state,
      connectionState,
      send,
      debug: {
        resetDiagram,
        runDemoScript,
      },
      updateNode,
      addNode,
      removeNode,
      addEdge,
      removeEdge,
      sendCursorPosition,
      sendSelection,
      userId,
      userColor,
      toggleTranscription,
      sessionStartedAt: state.sessionStartedAt,
    }),
    [connectionState, resetDiagram, runDemoScript, send, state, updateNode, addNode, removeNode, addEdge, removeEdge, sendCursorPosition, sendSelection, userId, userColor, toggleTranscription, state.sessionStartedAt]
  )

  return <MindMeshContext.Provider value={value}>{children}</MindMeshContext.Provider>
}
