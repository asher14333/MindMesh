"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { WebRTCProvider } from "@/hooks/webrtc-context"
import { useSpeech } from "@/hooks/use-speech"
import MeetingBar from "@/components/meeting-bar"
import MeetingBarStandby from "@/components/meeting-bar-standby"
import ParticipantStrip from "@/components/participant-strip"
import MeetingDock from "@/components/meeting-dock"
import MeetingStage from "@/components/meeting-stage"
import MeetingDockStandby from "@/components/meeting-dock-standby"
import { MindMeshProvider, useMindMesh } from "@/lib/mindmesh/store"

const ProcessCanvas = dynamic(() => import("@/components/process-canvas"), {
  ssr: false,
})

function MindMeshSpeechBridge({ active }: { active: boolean }) {
  const { send, state } = useMindMesh()

  useSpeech({
    active,
    send,
    lastTranscript: state.lastTranscript,
  })

  return null
}

const ROOM_ID = "demo-room"
const MEETING_TITLE = "Enterprise Customer Onboarding Approval Flow"

export default function MindMeshDemo() {
  const [mindMeshActive, setMindMeshActive] = useState(false)
  const [callEnded, setCallEnded] = useState(false)
  const [displayName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("mm-display-name") || "You"
    }
    return "You"
  })

  if (callEnded) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-white">
        <p className="text-lg font-medium text-neutral-900">You left the call</p>
        <button
          onClick={() => { setCallEnded(false); setMindMeshActive(false) }}
          className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          Rejoin
        </button>
      </div>
    )
  }

  return (
    <WebRTCProvider roomId={ROOM_ID} userId={displayName}>
      <MindMeshProvider
        sessionId={ROOM_ID}
        meetingTitle={MEETING_TITLE}
        visualizingEnabled={mindMeshActive}
      >
        <MindMeshSpeechBridge active />
        {!mindMeshActive ? (
          <div className="flex h-screen flex-col bg-white">
            <MeetingBarStandby />
            <main className="relative flex-1 overflow-hidden">
              <MeetingStage />
              <MeetingDockStandby
                onActivate={() => setMindMeshActive(true)}
                onLeave={() => setCallEnded(true)}
              />
            </main>
          </div>
        ) : (
          <div className="flex h-screen flex-col bg-white">
            <MeetingBar onBack={() => setMindMeshActive(false)} />
            <ParticipantStrip />
            <main className="relative flex-1 overflow-hidden">
              <ProcessCanvas />
              <MeetingDock onLeave={() => setCallEnded(true)} />
            </main>
          </div>
        )}
      </MindMeshProvider>
    </WebRTCProvider>
  )
}
