"use client"

import { Mic, MicOff, Video, VideoOff, Monitor, MoreHorizontal, PhoneOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import { useMindMesh } from "@/lib/mindmesh/store"

interface MeetingDockProps {
  onLeave?: () => void
}

export default function MeetingDock({ onLeave }: MeetingDockProps) {
  const { isMuted, isCameraOn, toggleMic, toggleCamera, leaveCall } = useWebRTCContext()
  const { state, connectionState } = useMindMesh()

  const pill = (() => {
    if (connectionState !== "open") {
      return {
        dot: connectionState === "error" ? "bg-red-500" : "bg-amber-500",
        text: `MindMesh ${connectionState}`,
      }
    }
    if (state.desynced) {
      return { dot: "bg-amber-500", text: `MindMesh resyncing (v${state.version})` }
    }
    return {
      dot: "bg-emerald-500",
      text: `${state.mode === "visualizing" ? "MindMesh live" : "MindMesh standby"} (${state.diagramType} v${state.version})`,
    }
  })()

  function handleLeave() {
    leaveCall()
    onLeave?.()
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 md:bottom-6">
      {/* Meeting controls */}
      <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/95 p-1.5 shadow-sm backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMic}
          title={isMuted ? "Unmute" : "Mute"}
          className={`h-10 w-10 rounded-lg ${
            isMuted ? "bg-red-500/10 text-red-600 hover:bg-red-500/20" : "text-foreground hover:bg-muted"
          }`}
        >
          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCamera}
          title={isCameraOn ? "Turn off camera" : "Turn on camera"}
          className={`h-10 w-10 rounded-lg ${
            !isCameraOn ? "bg-red-500/10 text-red-600 hover:bg-red-500/20" : "text-foreground hover:bg-muted"
          }`}
        >
          {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
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
          onClick={handleLeave}
          title="Leave call"
          className="h-10 w-10 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white"
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>

      {/* MindMesh status pill */}
      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${pill.dot}`} />
        <span className="text-[11px] font-medium text-muted-foreground">{pill.text}</span>
      </div>
    </div>
  )
}
