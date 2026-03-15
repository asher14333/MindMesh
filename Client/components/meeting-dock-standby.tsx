"use client"

import { Mic, MicOff, Video, VideoOff, Monitor, MoreHorizontal, PhoneOff, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWebRTCContext } from "@/hooks/webrtc-context"

interface MeetingDockStandbyProps {
  onActivate: () => void
  onLeave?: () => void
}

export default function MeetingDockStandby({ onActivate, onLeave }: MeetingDockStandbyProps) {
  const { isMuted, isCameraOn, toggleMic, toggleCamera, leaveCall } = useWebRTCContext()

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
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-xl text-foreground transition-all duration-200 hover:bg-muted hover:scale-105"
        >
          <Monitor className="h-[18px] w-[18px]" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-xl text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-105"
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
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

      {/* MindMesh activation button */}
      <Button
        onClick={onActivate}
        className="group h-11 gap-2.5 rounded-2xl bg-accent px-5 text-accent-foreground shadow-lg shadow-accent/20 transition-all duration-300 hover:bg-accent/90 hover:scale-[1.03] hover:shadow-xl hover:shadow-accent/25"
      >
        <Sparkles className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
        <span className="text-sm font-semibold tracking-tight">Turn On MindMesh</span>
      </Button>
    </div>
  )
}
