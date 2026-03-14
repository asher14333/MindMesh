"use client"

import dynamic from "next/dynamic"
import { useRef, useState } from "react"
import { WebRTCProvider } from "@/hooks/webrtc-context"
import { useSpeech } from "@/hooks/use-speech"
import MeetingBar from "@/components/meeting-bar"
import MeetingBarStandby from "@/components/meeting-bar-standby"
import ParticipantStrip from "@/components/participant-strip"
import MeetingDock from "@/components/meeting-dock"
import MeetingStage from "@/components/meeting-stage"
import MeetingDockStandby from "@/components/meeting-dock-standby"
import { MindMeshProvider } from "@/lib/mindmesh/store"

const ProcessCanvas = dynamic(() => import("@/components/process-canvas"), {
  ssr: false,
})

function createSessionId() {
  // Stable per-tab session id (in-memory). Helps avoid cross-tab conflicts while still
  // keeping a consistent session across re-renders.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `mm-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`
}

const ROOM_ID = "demo-room"
const MEETING_TITLE = "Enterprise Customer Onboarding Approval Flow"

export default function MindMeshDemo() {
  const [mindMeshActive, setMindMeshActive] = useState(false)
  const [callEnded, setCallEnded] = useState(false)
  const sessionIdRef = useRef<string>(createSessionId())

  // Active on both standby and MindMesh views — logs speech to the browser
  // console and pipes transcripts to the backend diagram pipeline.
  // Diagram generation is only enabled when mindMeshActive is true.
  useSpeech(sessionIdRef.current, !callEnded, mindMeshActive)

  if (callEnded) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-lg font-medium text-foreground">You left the call</p>
        <button
          onClick={() => { setCallEnded(false); setMindMeshActive(false) }}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-secondary hover:bg-muted"
        >
          Rejoin
        </button>
      </div>
    )
  }

  return (
    <WebRTCProvider roomId={ROOM_ID} userId="You">
      {!mindMeshActive ? (
        <div className="flex h-screen flex-col bg-background">
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
        <MindMeshProvider sessionId={sessionIdRef.current} meetingTitle={MEETING_TITLE}>
          <div className="flex h-screen flex-col bg-background">
            <MeetingBar />
            <ParticipantStrip />
            <main className="relative flex-1 overflow-hidden">
              <ProcessCanvas />
              <MeetingDock onLeave={() => setCallEnded(true)} />
            </main>
          </div>
        </MindMeshProvider>
      )}
    </WebRTCProvider>
  )
}
