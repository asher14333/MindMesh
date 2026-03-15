"use client"

import { useEffect, useState } from "react"
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Clock,
  AudioLines,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import { useMindMesh } from "@/lib/mindmesh/store"

interface MeetingDockProps {
  onLeave?: () => void
}

/** Simple elapsed-time counter (HH:MM:SS). */
function useElapsedTime() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function MeetingDock({ onLeave }: MeetingDockProps) {
  const { isMuted, isCameraOn, toggleMic, toggleCamera, leaveCall } =
    useWebRTCContext()
  const { state, connectionState, toggleTranscription } = useMindMesh()
  const elapsed = useElapsedTime()

  const isListening = state.isTranscribing

  const pill = (() => {
    if (connectionState !== "open") {
      return {
        dot: connectionState === "error" ? "bg-red-500" : "bg-amber-500",
        text: `MindMesh ${connectionState}`,
      }
    }
    if (state.desynced) {
      return {
        dot: "bg-amber-500",
        text: `MindMesh resyncing (v${state.version})`,
      }
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
    <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center pb-5">
      <div
        className="flex items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white px-4 py-2"
        style={{
          boxShadow:
            "0 -2px 20px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.06)",
        }}
      >
        {/* Timer */}
        <div className="flex items-center gap-1.5 border-r border-neutral-200 pr-3 mr-1">
          <Clock className="h-3.5 w-3.5 text-neutral-400" />
          <span className="font-mono text-xs font-medium text-neutral-500 tabular-nums">
            {elapsed}
          </span>
        </div>

        {/* Mic */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMic}
          title={isMuted ? "Unmute" : "Mute"}
          className={`h-10 w-10 rounded-full ${
            isMuted
              ? "bg-red-50 text-red-500 hover:bg-red-100"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {isMuted ? (
            <MicOff className="h-[18px] w-[18px]" />
          ) : (
            <Mic className="h-[18px] w-[18px]" />
          )}
        </Button>

        {/* Camera */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCamera}
          title={isCameraOn ? "Turn off camera" : "Turn on camera"}
          className={`h-10 w-10 rounded-full ${
            !isCameraOn
              ? "bg-red-50 text-red-500 hover:bg-red-100"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {isCameraOn ? (
            <Video className="h-[18px] w-[18px]" />
          ) : (
            <VideoOff className="h-[18px] w-[18px]" />
          )}
        </Button>

        {/* End call */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLeave}
          title="Leave call"
          className="h-10 w-10 rounded-full bg-red-500 text-white hover:bg-red-600"
        >
          <PhoneOff className="h-[18px] w-[18px]" />
        </Button>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-neutral-200" />

        {/* MindMesh status pill */}
        <div className="flex items-center gap-1.5 px-1">
          <span
            className={`h-1.5 w-1.5 animate-pulse rounded-full ${pill.dot}`}
          />
          <span className="text-[11px] font-medium text-neutral-500">
            {pill.text}
          </span>
        </div>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-neutral-200" />

        {/* Speech-to-Text Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTranscription}
          title={isListening ? "Stop transcription" : "Start transcription"}
          className={`h-10 w-10 rounded-full transition-all ${
            isListening
              ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 ring-2 ring-emerald-200"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          }`}
        >
          <AudioLines className={`h-[18px] w-[18px] ${isListening ? "animate-pulse" : ""}`} />
        </Button>

        {/* Speech indicator */}
        {isListening && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium text-emerald-600">
              Transcribing
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
