"use client"

import { Mic, Video, Monitor, MoreHorizontal, PhoneOff } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function MeetingDock() {
  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 md:bottom-6">
      {/* Meeting controls */}
      <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/95 p-1.5 shadow-sm backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-lg text-foreground hover:bg-muted"
        >
          <Mic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-lg text-foreground hover:bg-muted"
        >
          <Video className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-lg text-foreground hover:bg-muted"
        >
          <Monitor className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        
        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-border/60" />
        
        {/* End call */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:text-red-700"
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>

      {/* MindMesh status pill */}
      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        <span className="text-[11px] font-medium text-muted-foreground">MindMesh generating</span>
      </div>
    </div>
  )
}
