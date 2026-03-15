"use client"

import { z } from "zod"

export const DiagramTypeSchema = z.enum([
  "flowchart",
  "timeline",
  "mindmap",
  "orgchart",
  "none",
])
export type DiagramType = z.infer<typeof DiagramTypeSchema>

export const SessionModeSchema = z.enum(["standby", "visualizing"])
export type SessionMode = z.infer<typeof SessionModeSchema>

export const IntentActionSchema = z.enum(["update", "replace", "noop"])
export type IntentAction = z.infer<typeof IntentActionSchema>

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})
export type Position = z.infer<typeof PositionSchema>

export const ViewportHintSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
})
export type ViewportHint = z.infer<typeof ViewportHintSchema>

export const DiagramNodeDataSchema = z
  .object({
    label: z.string(),
    kind: z.string().default("step"),
    status: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    lane: z.string().nullable().optional(),
    actor: z.string().nullable().optional(),
    time_label: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
    source_span: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).default({}),
  })
  .passthrough()
export type DiagramNodeData = z.infer<typeof DiagramNodeDataSchema>

function withParentAlias(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw

  const record = raw as Record<string, unknown>
  if (!("parent_id" in record) || "parentId" in record) return raw

  return {
    ...record,
    parentId: record.parent_id,
  }
}

export const DiagramNodeSchema = z
  .preprocess(
    withParentAlias,
    z
      .object({
        id: z.string(),
        type: z.string().default("default"),
        position: PositionSchema.default({ x: 0, y: 0 }),
        hidden: z.boolean().default(false),
        parentId: z.string().nullable().optional(),
        data: DiagramNodeDataSchema,
      })
      .passthrough()
  )
export type DiagramNode = z.infer<typeof DiagramNodeSchema>

export const DiagramEdgeDataSchema = z
  .object({
    kind: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
  })
  .passthrough()
export type DiagramEdgeData = z.infer<typeof DiagramEdgeDataSchema>

export const DiagramEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    type: z.string().default("default"),
    label: z.string().nullable().optional(),
    hidden: z.boolean().default(false),
    animated: z.boolean().default(false),
    data: DiagramEdgeDataSchema.default({}),
  })
  .passthrough()
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>

export const DiagramDocumentSchema = z.object({
  diagram_id: z.string().optional(),
  diagram_type: DiagramTypeSchema,
  nodes: z.array(DiagramNodeSchema).default([]),
  edges: z.array(DiagramEdgeSchema).default([]),
  version: z.number().int().nonnegative().default(0),
  layout_version: z.number().int().nonnegative().default(0),
  viewport_hint: ViewportHintSchema.nullable().optional(),
})
export type DiagramDocument = z.infer<typeof DiagramDocumentSchema>

const NodePatchDataSchema = z
  .preprocess(
    withParentAlias,
    z
      .object({
        id: z.string(),
        type: z.string().optional(),
        position: PositionSchema.optional(),
        hidden: z.boolean().optional(),
        parentId: z.string().nullable().optional(),
        data: DiagramNodeDataSchema.partial().optional(),
        label: z.string().optional(),
        kind: z.string().optional(),
        status: z.string().nullable().optional(),
      })
      .passthrough()
  )
const AddNodePatchDataSchema = NodePatchDataSchema

const PartialDiagramEdgeDataSchema = z
  .object({
    kind: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
  })
  .passthrough()

const EdgePatchDataSchema = z
  .object({
    id: z.string(),
    source: z.string().optional(),
    target: z.string().optional(),
    type: z.string().optional(),
    label: z.string().nullable().optional(),
    hidden: z.boolean().optional(),
    animated: z.boolean().optional(),
    data: PartialDiagramEdgeDataSchema.optional(),
  })
  .passthrough()
const AddEdgePatchDataSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    type: z.string().optional(),
    label: z.string().nullable().optional(),
    hidden: z.boolean().optional(),
    animated: z.boolean().optional(),
    data: PartialDiagramEdgeDataSchema.optional(),
  })
  .passthrough()

export const PatchOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_node"), data: AddNodePatchDataSchema }),
  z.object({ op: z.literal("update_node"), data: NodePatchDataSchema }),
  z.object({ op: z.literal("remove_node"), data: NodePatchDataSchema }),
  z.object({ op: z.literal("add_edge"), data: AddEdgePatchDataSchema }),
  z.object({ op: z.literal("update_edge"), data: EdgePatchDataSchema }),
  z.object({ op: z.literal("remove_edge"), data: EdgePatchDataSchema }),
])
export type PatchOp = z.infer<typeof PatchOpSchema>

export const DiagramPatchSchema = z.object({
  diagram_id: z.string().nullable().optional(),
  diagram_type: DiagramTypeSchema,
  base_version: z.number().int().nonnegative().default(0),
  ops: z.array(PatchOpSchema).default([]),
  version: z.number().int().nonnegative().default(0),
  reason: z.string().nullable().optional(),
  layout_changed: z.boolean().default(false),
  viewport_hint: ViewportHintSchema.nullable().optional(),
})
export type DiagramPatch = z.infer<typeof DiagramPatchSchema>

export const TranscriptUpdateEventSchema = z.object({
  type: z.literal("transcript.update"),
  text: z.string(),
  is_final: z.boolean().optional().default(false),
  speaker: z.string().nullable().optional(),
})
export type TranscriptUpdateEvent = z.infer<typeof TranscriptUpdateEventSchema>

export const IntentResultSchema = z.object({
  diagram_type: DiagramTypeSchema,
  confidence: z.number(),
  action: IntentActionSchema,
  reason: z.string().nullable().optional(),
})
export type IntentResult = z.infer<typeof IntentResultSchema>

export const IntentResultEventSchema = z.object({
  type: z.literal("intent.result"),
  result: IntentResultSchema,
})
export type IntentResultEvent = z.infer<typeof IntentResultEventSchema>

export const DiagramReplaceEventSchema = z.object({
  type: z.literal("diagram.replace"),
  diagram: DiagramDocumentSchema,
})
export type DiagramReplaceEvent = z.infer<typeof DiagramReplaceEventSchema>

export const DiagramPatchEventSchema = z.object({
  type: z.literal("diagram.patch"),
  patch: DiagramPatchSchema,
})
export type DiagramPatchEvent = z.infer<typeof DiagramPatchEventSchema>

export const StatusEventSchema = z.object({
  type: z.literal("status"),
  session_id: z.string(),
  mode: SessionModeSchema,
  message: z.string(),
  diagram_type: DiagramTypeSchema.nullable().optional(),
})
export type StatusEvent = z.infer<typeof StatusEventSchema>

export const ErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
})
export type ErrorEvent = z.infer<typeof ErrorEventSchema>

export const ServerEventSchema = z.discriminatedUnion("type", [
  TranscriptUpdateEventSchema,
  IntentResultEventSchema,
  DiagramReplaceEventSchema,
  DiagramPatchEventSchema,
  StatusEventSchema,
  ErrorEventSchema,
])
export type ServerEvent = z.infer<typeof ServerEventSchema> | CollabServerEvent | TranscriptionToggleEvent

export function parseServerEvent(raw: unknown): ServerEvent | null {
  // Try lightweight event types first (collab + transcription toggle)
  if (raw && typeof raw === "object" && "type" in raw) {
    const r = raw as Record<string, unknown>
    if (r.type === "collab.cursor") return raw as CollabCursorEvent
    if (r.type === "collab.selection") return raw as CollabSelectionEvent
    if (r.type === "collab.edit") return raw as CollabEditEvent
    if (r.type === "transcription.toggle") return raw as TranscriptionToggleEvent
  }
  const parsed = ServerEventSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data
}

// ─── Canvas edit patch (user-driven edits sent to server) ───────────────────
export type CanvasEditOp =
  | { op: "update_node"; id: string; changes: Partial<DiagramNodeData> & { position?: { x: number; y: number } } }
  | { op: "add_node"; id: string; position: { x: number; y: number }; data: DiagramNodeData }
  | { op: "remove_node"; id: string }
  | { op: "add_edge"; id: string; source: string; target: string }
  | { op: "remove_edge"; id: string }

// ─── Collaboration events ───────────────────────────────────────────────────
export type CursorPosition = {
  x: number
  y: number
}

export type CollabCursorEvent = {
  type: "collab.cursor"
  user_id: string
  user_name: string
  position: CursorPosition
  color: string
}

export type CollabSelectionEvent = {
  type: "collab.selection"
  user_id: string
  user_name: string
  node_id: string | null
  color: string
}

export type CollabEditEvent = {
  type: "collab.edit"
  user_id: string
  ops: CanvasEditOp[]
}

export type CollabServerEvent = CollabCursorEvent | CollabSelectionEvent | CollabEditEvent

// Transcription toggle (shared across all users)
export type TranscriptionToggleEvent = {
  type: "transcription.toggle"
  enabled: boolean
  user_id: string
  user_name: string
}

// Minimal inbound client events used to make the demo "go".
export type ClientEvent =
  | { type: "session.start"; meeting_title?: string | null }
  | { type: "session.stop" }
  | { type: "speech.partial"; text: string; speaker?: string | null }
  | { type: "speech.final"; text: string; speaker?: string | null }
  | { type: "ui.command"; command: string; payload?: Record<string, unknown> }
  | { type: "canvas.edit"; ops: CanvasEditOp[] }
  | { type: "collab.cursor"; user_id: string; user_name: string; position: CursorPosition; color: string }
  | { type: "collab.selection"; user_id: string; user_name: string; node_id: string | null; color: string }
  | TranscriptionToggleEvent

export function buildMindMeshBaseWsUrl(): string {
  return (process.env.NEXT_PUBLIC_MINDMESH_WS_URL ?? "ws://localhost:8000")
    .replace(/^http/i, "ws")
    .replace(/\/$/, "")
}

export function buildMindMeshWsUrl(sessionId: string): string {
  const base = buildMindMeshBaseWsUrl()
  return `${base}/ws/${encodeURIComponent(sessionId)}`
}

export function buildMindMeshRoomWsUrl(roomId: string, userId?: string): string {
  const base = buildMindMeshBaseWsUrl()
  const search = userId
    ? `?${new URLSearchParams({ user_id: userId }).toString()}`
    : ""
  return `${base}/ws/room/${encodeURIComponent(roomId)}${search}`
}
