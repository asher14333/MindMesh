"use client"

import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react"
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
      dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]",
      text: `${state.mode === "visualizing" ? "MindMesh live" : "MindMesh standby"} (${state.diagramType} v${state.version})`,
    }
  })()

  function handleLeave() {
    leaveCall()
    onLeave?.()
  }

  return (
    <div className="animate-dock-enter absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 md:bottom-6">
      {/* Meeting controls */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-border/40 bg-card/90 p-2 shadow-lg shadow-black/[0.04] backdrop-blur-xl">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMic}
          title={isMuted ? "Unmute" : "Mute"}
          className={`h-11 w-11 rounded-xl transition-all duration-200 ${
            isMuted
              ? "bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:scale-105"
              : "text-foreground hover:bg-muted hover:scale-105"
          }`}
        >
          {isMuted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCamera}
          title={isCameraOn ? "Turn off camera" : "Turn on camera"}
          className={`h-11 w-11 rounded-xl transition-all duration-200 ${
            !isCameraOn
              ? "bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:scale-105"
              : "text-foreground hover:bg-muted hover:scale-105"
          }`}
        >
          {isCameraOn ? <Video className="h-[18px] w-[18px]" /> : <VideoOff className="h-[18px] w-[18px]" />}
        </Button>
        {/* Divider */}
        <div className="mx-0.5 h-7 w-px bg-border/40" />

        {/* End call */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLeave}
          title="Leave call"
          className="h-11 w-11 rounded-xl bg-red-500/10 text-red-600 transition-all duration-200 hover:bg-red-500 hover:text-white hover:scale-105 hover:shadow-md hover:shadow-red-500/20"
        >
          <PhoneOff className="h-[18px] w-[18px]" />
        </Button>
      </div>

      {/* MindMesh status pill */}
      <div className="flex items-center gap-2 rounded-2xl border border-border/30 bg-card/85 px-3.5 py-2 shadow-lg shadow-black/[0.04] backdrop-blur-xl">
        <span className={`h-2 w-2 animate-pulse rounded-full ${pill.dot}`} />
        <span className="text-[11px] font-semibold tracking-tight text-muted-foreground">{pill.text}</span>
      </div>
    </div>
  )
}
