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

      {/* MindMesh activation button */}
      <Button
        onClick={onActivate}
        className="h-10 gap-2 rounded-xl bg-accent px-4 text-accent-foreground shadow-sm hover:bg-accent/90"
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">Turn On MindMesh</span>
      </Button>
    </div>
  )
}
