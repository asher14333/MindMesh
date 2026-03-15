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
import { useMindMesh } from "@/lib/mindmesh/store"

export default function ProcessCanvas() {
  const { state, connectionState } = useMindMesh()
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

    </div>
  )
}
