"use client"

import { useState } from "react"
import { ZoomIn, ZoomOut, Maximize2, GitBranch, Network, Layers, Users } from "lucide-react"
import { Button } from "@/components/ui/button"

const viewModes = [
  { id: "process", label: "Process Flow", icon: GitBranch },
  { id: "system", label: "System Map", icon: Network },
  { id: "ui", label: "UI Flow", icon: Layers },
  { id: "relationship", label: "Relationship Map", icon: Users },
]

export default function CanvasControls() {
  const [activeView, setActiveView] = useState("process")
  const [zoom, setZoom] = useState(100)

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 md:bottom-6">
      {/* View mode selector */}
      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/95 p-1 shadow-sm backdrop-blur-sm">
        {viewModes.map((mode) => {
          const Icon = mode.icon
          const isActive = activeView === mode.id
          return (
            <button
              key={mode.id}
              onClick={() => setActiveView(mode.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-border/60" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/95 p-1 shadow-sm backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setZoom(Math.max(50, zoom - 10))}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="w-10 text-center text-xs font-medium text-muted-foreground">
          {zoom}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setZoom(Math.min(200, zoom + 10))}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setZoom(100)}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Live view indicator */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        <span className="text-xs font-medium text-muted-foreground">Live View</span>
      </div>
    </div>
  )
}
