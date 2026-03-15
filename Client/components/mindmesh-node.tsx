"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react"
import { Check, Edit2, Lightbulb, Play, GitPullRequest, X, MessageSquare } from "lucide-react"
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
    icon: MessageSquare, // Using MessageSquare for action as in image it looks like a note
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

// Map common names to colors for the avatar badges
const actorColors: Record<string, string> = {
  Ali: "bg-teal-600",
  Sarah: "bg-pink-500",
  James: "bg-orange-500",
  default: "bg-blue-500"
}

export const MindMeshNode = memo(({ data, selected }: NodeProps<RFNode>) => {
  const { kind = "step", label, actor } = data
  const normalizedKind = (kind || "step").toLowerCase()
  const config = kindConfig[normalizedKind] || kindConfig.step
  const Icon = config.icon
  
  const actorColor = actor ? (actorColors[actor] || actorColors.default) : actorColors.default

  return (
    <div
      className={cn(
        "relative w-[280px] rounded-2xl border-2 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] transition-all hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12)]",
        selected ? "ring-2 ring-primary border-primary" : `${config.border} border-opacity-50 hover:border-opacity-100`
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-300 !w-2.5 !h-2.5 !-left-1.5"
      />
      
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("w-4 h-4", config.color)} />
        <span className={cn("text-[11px] font-bold uppercase tracking-wider", config.color)}>
          {config.label} {actor ? `- ${actor.toUpperCase()}` : ""}
        </span>
      </div>

      {/* Content */}
      <div className="text-[15px] font-semibold text-slate-800 leading-snug mb-5">
        {label}
      </div>

      {/* Footer / Actions */}
      <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-slate-50">
        <button className="group p-1.5 rounded-full hover:bg-emerald-50 text-slate-300 hover:text-emerald-600 transition-colors">
          <Check className="w-4 h-4" />
        </button>
        <button className="group p-1.5 rounded-full hover:bg-blue-50 text-slate-300 hover:text-blue-600 transition-colors">
          <Edit2 className="w-4 h-4" />
        </button>
        <button className="group p-1.5 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-600 transition-colors">
          <X className="w-4 h-4" />
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
        className="!bg-slate-300 !w-2.5 !h-2.5 !-right-1.5"
      />
    </div>
  )
})

MindMeshNode.displayName = "MindMeshNode"
