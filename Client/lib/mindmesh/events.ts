"use client"

import { z } from "zod"

// Mirrors backend enums in:
// - backend/app/state/session_state.py
// - backend/app/schemas/diagram.py
// - backend/app/schemas/intent.py

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

export const DiagramNodeSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    kind: z.string().default("step"),
    status: z.string().nullable().optional(),
    position: PositionSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough()
export type DiagramNode = z.infer<typeof DiagramNodeSchema>

export const DiagramEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().nullable().optional(),
  })
  .passthrough()
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>

export const DiagramDocumentSchema = z.object({
  diagram_type: DiagramTypeSchema,
  nodes: z.array(DiagramNodeSchema).default([]),
  edges: z.array(DiagramEdgeSchema).default([]),
  version: z.number().int().nonnegative().default(0),
})
export type DiagramDocument = z.infer<typeof DiagramDocumentSchema>

const NodePatchDataSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    kind: z.string().optional(),
    status: z.string().nullable().optional(),
    position: PositionSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough()
const AddNodePatchDataSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    kind: z.string().optional(),
    status: z.string().nullable().optional(),
    position: PositionSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough()

const EdgePatchDataSchema = z
  .object({
    id: z.string(),
    source: z.string().optional(),
    target: z.string().optional(),
    label: z.string().nullable().optional(),
  })
  .passthrough()
const AddEdgePatchDataSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().optional().nullable(),
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
  diagram_type: DiagramTypeSchema,
  ops: z.array(PatchOpSchema).default([]),
  version: z.number().int().nonnegative().default(0),
  reason: z.string().nullable().optional(),
})
export type DiagramPatch = z.infer<typeof DiagramPatchSchema>

export const TranscriptUpdateEventSchema = z.object({
  type: z.literal("transcript.update"),
  text: z.string(),
  is_final: z.boolean().optional().default(false),
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

export const ServerEventSchema = z.discriminatedUnion("type", [
  TranscriptUpdateEventSchema,
  IntentResultEventSchema,
  DiagramReplaceEventSchema,
  DiagramPatchEventSchema,
  StatusEventSchema,
])
export type ServerEvent = z.infer<typeof ServerEventSchema>

export function parseServerEvent(raw: unknown): ServerEvent | null {
  const parsed = ServerEventSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data
}

// Minimal inbound client events used to make the demo “go”.
export type ClientEvent =
  | { type: "session.start"; meeting_title?: string | null }
  | { type: "ui.command"; command: string; payload?: Record<string, unknown> }

export function buildMindMeshWsUrl(sessionId: string): string {
  const base = (process.env.NEXT_PUBLIC_MINDMESH_WS_URL ?? "ws://localhost:8000").replace(
    /\/$/,
    ""
  )
  return `${base}/ws/${encodeURIComponent(sessionId)}`
}
