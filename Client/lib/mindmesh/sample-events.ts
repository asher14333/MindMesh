"use client"

import type { ServerEvent } from "@/lib/mindmesh/events"

// A deterministic, versioned sequence that matches backend outbound schemas.
// Use this to validate React Flow rendering without needing the backend running.
export const SAMPLE_SERVER_EVENTS: ServerEvent[] = [
  {
    type: "status",
    session_id: "sample-session",
    mode: "visualizing",
    message: "connected (mock)",
    diagram_type: "flowchart",
  },
  {
    type: "transcript.update",
    text: "Sales hands off to solutions engineering. Then we route to security, legal, and procurement in parallel. Once approvals are complete, provisioning starts. Provisioning then splits into access setup and training, which merge into go-live and onboarding.",
    is_final: true,
  },
  {
    type: "intent.result",
    result: {
      diagram_type: "flowchart",
      confidence: 0.9,
      action: "update",
      reason: "sample",
    },
  },
  {
    type: "diagram.replace",
    diagram: {
      diagram_type: "flowchart",
      version: 1,
      nodes: [
        {
          id: "n1",
          label: "Sales handoff",
          kind: "step",
          status: "done",
          position: { x: 0, y: 0 },
          metadata: {},
        },
        {
          id: "n2",
          label: "Scope definition",
          kind: "step",
          status: "done",
          position: { x: 360, y: 0 },
          metadata: {},
        },
        {
          id: "n3",
          label: "Review routing",
          kind: "decision",
          status: null,
          position: { x: 720, y: 0 },
          metadata: {},
        },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", label: null },
        { id: "e2", source: "n2", target: "n3", label: null },
      ],
    },
  },
  {
    type: "diagram.patch",
    patch: {
      diagram_type: "flowchart",
      version: 2,
      reason: "fanout_reviews",
      ops: [
        {
          op: "add_node",
          data: {
            id: "n4",
            label: "Security review",
            kind: "step",
            status: null,
            position: { x: 1080, y: -240 },
            metadata: {},
          },
        },
        {
          op: "add_node",
          data: {
            id: "n5",
            label: "Legal review",
            kind: "step",
            status: null,
            position: { x: 1080, y: 0 },
            metadata: {},
          },
        },
        {
          op: "add_node",
          data: {
            id: "n6",
            label: "Procurement",
            kind: "step",
            status: null,
            position: { x: 1080, y: 240 },
            metadata: {},
          },
        },
        { op: "add_edge", data: { id: "e3", source: "n3", target: "n4", label: "security" } },
        { op: "add_edge", data: { id: "e4", source: "n3", target: "n5", label: "legal" } },
        { op: "add_edge", data: { id: "e5", source: "n3", target: "n6", label: "procurement" } },
      ],
    },
  },
  {
    type: "diagram.patch",
    patch: {
      diagram_type: "flowchart",
      version: 3,
      reason: "merge_reviews",
      ops: [
        {
          op: "add_node",
          data: {
            id: "n7",
            label: "Approval complete",
            kind: "step",
            status: null,
            position: { x: 1440, y: 0 },
            metadata: {},
          },
        },
        {
          op: "add_edge",
          data: { id: "e6", source: "n4", target: "n7", label: null },
        },
        {
          op: "add_edge",
          data: { id: "e7", source: "n5", target: "n7", label: null },
        },
        {
          op: "add_edge",
          data: { id: "e8", source: "n6", target: "n7", label: null },
        },
      ],
    },
  },
  {
    type: "diagram.patch",
    patch: {
      diagram_type: "flowchart",
      version: 4,
      reason: "provisioning",
      ops: [
        {
          op: "add_node",
          data: {
            id: "n8",
            label: "Provisioning",
            kind: "step",
            status: "waiting",
            position: { x: 1800, y: 0 },
            metadata: {},
          },
        },
        {
          op: "add_edge",
          data: { id: "e9", source: "n7", target: "n8", label: null },
        },
      ],
    },
  },
  {
    type: "diagram.patch",
    patch: {
      diagram_type: "flowchart",
      version: 5,
      reason: "fanout_enablement",
      ops: [
        {
          op: "add_node",
          data: {
            id: "n9",
            label: "Access setup",
            kind: "step",
            status: null,
            position: { x: 2160, y: -170 },
            metadata: {},
          },
        },
        {
          op: "add_node",
          data: {
            id: "n10",
            label: "Training scheduled",
            kind: "step",
            status: null,
            position: { x: 2160, y: 170 },
            metadata: {},
          },
        },
        { op: "add_edge", data: { id: "e10", source: "n8", target: "n9", label: "parallel" } },
        { op: "add_edge", data: { id: "e11", source: "n8", target: "n10", label: "parallel" } },
      ],
    },
  },
  {
    type: "diagram.patch",
    patch: {
      diagram_type: "flowchart",
      version: 6,
      reason: "merge_enablement",
      ops: [
        {
          op: "add_node",
          data: {
            id: "n11",
            label: "Go-live",
            kind: "step",
            status: null,
            position: { x: 2520, y: 0 },
            metadata: {},
          },
        },
        { op: "add_edge", data: { id: "e12", source: "n9", target: "n11", label: null } },
        { op: "add_edge", data: { id: "e13", source: "n10", target: "n11", label: null } },
      ],
    },
  },
  {
    type: "diagram.patch",
    patch: {
      diagram_type: "flowchart",
      version: 7,
      reason: "finish",
      ops: [
        {
          op: "add_node",
          data: {
            id: "n12",
            label: "Customer onboard",
            kind: "step",
            status: null,
            position: { x: 2880, y: 0 },
            metadata: {},
          },
        },
        { op: "add_edge", data: { id: "e14", source: "n11", target: "n12", label: null } },
      ],
    },
  },
  {
    type: "diagram.patch",
    patch: {
      diagram_type: "flowchart",
      version: 8,
      reason: "status_update",
      ops: [
        { op: "update_node", data: { id: "n4", status: "blocked" } },
        { op: "update_node", data: { id: "n5", status: "done" } },
        { op: "update_node", data: { id: "n6", status: "waiting" } },
        { op: "update_node", data: { id: "n8", status: "active" } },
        { op: "update_edge", data: { id: "e3", label: "needs sign-off" } },
      ],
    },
  },
]
