"use client"

import { memo, useState, useRef, useEffect, useCallback } from "react"
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react"
import { Check, Edit2, Lightbulb, GitPullRequest, X, MessageSquare, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { type DiagramNodeData } from "@/lib/mindmesh/events"

type RFNode = Node<DiagramNodeData>

const kindConfig: Record<string, { icon: any; color: string; label: string; border: string }> = {
  idea: { 
    icon: Lightbulb, 
    color: "text-teal-600", 
    label: "IDEA",
    border: "border-teal-600"
  },
  decision: { 
    icon: Check, 
    color: "text-emerald-600", 
    label: "DECISION",
    border: "border-emerald-600"
  },
  action: { 
    icon: MessageSquare,
    color: "text-orange-600", 
    label: "ACTION",
    border: "border-orange-600"
  },
  step: { 
    icon: GitPullRequest, 
    color: "text-slate-600", 
    label: "STEP",
    border: "border-slate-600"
  },
}

const actorColors: Record<string, string> = {
  Ali: "bg-teal-600",
  Sarah: "bg-pink-500",
  James: "bg-orange-500",
  default: "bg-blue-500"
}

export const MindMeshNode = memo(({ data, selected, id }: NodeProps<RFNode>) => {
  const { kind = "step", label, actor } = data
  const normalizedKind = (kind || "step").toLowerCase()
  const config = kindConfig[normalizedKind] || kindConfig.step
  const Icon = config.icon
  
  const actorColor = actor ? (actorColors[actor] || actorColors.default) : actorColors.default

  // ─── Inline editing state ───────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  // Access MindMesh context for edit actions — passed via data
  const onUpdateNode = data._onUpdateNode as ((id: string, changes: any) => void) | undefined
  const onRemoveNode = data._onRemoveNode as ((id: string) => void) | undefined
  const remoteSelectionColor = data._remoteSelectionColor as string | undefined
  const remoteSelectionUser = data._remoteSelectionUser as string | undefined

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Sync editValue when label changes externally (e.g. AI update)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(label)
    }
  }, [label, isEditing])

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditValue(label)
  }, [label])

  const handleSave = useCallback(() => {
    setIsEditing(false)
    if (editValue.trim() && editValue.trim() !== label) {
      onUpdateNode?.(id, { label: editValue.trim() })
    }
  }, [editValue, label, onUpdateNode, id])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      setIsEditing(false)
      setEditValue(label)
    }
  }, [handleSave, label])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRemoveNode?.(id)
  }, [onRemoveNode, id])

  return (
    <div
      className={cn(
        "relative w-[280px] rounded-2xl border-2 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] transition-all hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12)]",
        selected ? "ring-2 ring-primary border-primary" : `${config.border} border-opacity-50 hover:border-opacity-100`
      )}
      style={remoteSelectionColor ? {
        boxShadow: `0 0 0 3px ${remoteSelectionColor}40, 0 4px 20px -4px rgba(0,0,0,0.1)`,
        borderColor: remoteSelectionColor,
      } : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3.5 !h-3.5 !-left-2 !bg-slate-400 !border-2 !border-white hover:!bg-blue-500 hover:!scale-125 !transition-all"
      />
      
      {/* Remote selection badge */}
      {remoteSelectionUser && (
        <div
          className="absolute -top-3 left-4 rounded-full px-2 py-0.5 text-[9px] font-bold text-white shadow-sm"
          style={{ backgroundColor: remoteSelectionColor }}
        >
          {remoteSelectionUser}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("w-4 h-4", config.color)} />
        <span className={cn("text-[11px] font-bold uppercase tracking-wider", config.color)}>
          {config.label} {actor ? `- ${actor.toUpperCase()}` : ""}
        </span>
      </div>

      {/* Content */}
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full text-[15px] font-semibold text-slate-800 leading-snug mb-5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          placeholder="Enter label..."
        />
      ) : (
        <div
          className="text-[15px] font-semibold text-slate-800 leading-snug mb-5 cursor-text hover:bg-slate-50 rounded-lg px-1 -mx-1 py-0.5 transition-colors"
          onDoubleClick={handleStartEdit}
        >
          {label}
        </div>
      )}

      {/* Footer / Actions */}
      <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-slate-50">
        <button
          className="group p-1.5 rounded-full hover:bg-emerald-50 text-slate-300 hover:text-emerald-600 transition-colors"
          title="Mark done"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          className="group p-1.5 rounded-full hover:bg-blue-50 text-slate-300 hover:text-blue-600 transition-colors"
          onClick={handleStartEdit}
          title="Edit label"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          className="group p-1.5 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-600 transition-colors"
          onClick={handleDelete}
          title="Delete node"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        
        {/* Actor Badge */}
        {actor && (
            <div className={cn("ml-auto text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm", actorColor)}>
                {actor}
            </div>
        )}
      </div>

      {/* Specific decorative elements based on type */}
      {normalizedKind === 'decision' && (
          <div className="absolute -right-1 top-1/2 w-2 h-2 bg-emerald-500 rotate-45 transform -translate-y-1/2" />
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3.5 !h-3.5 !-right-2 !bg-slate-400 !border-2 !border-white hover:!bg-blue-500 hover:!scale-125 !transition-all"
      />
    </div>
  )
})

MindMeshNode.displayName = "MindMeshNode"
