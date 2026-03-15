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

  if (callEnded) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
        <div className="animate-scale-in flex flex-col items-center gap-4">
          {/* Logo */}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary animate-float">
            <svg className="h-6 w-6 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4" /><path d="M12 18v4" /><path d="M2 12h4" /><path d="M18 12h4" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-foreground tracking-tight">You left the call</p>
          <p className="text-sm text-muted-foreground">Your session has ended</p>
          <button
            onClick={() => { setCallEnded(false); setMindMeshActive(false) }}
            className="mt-2 rounded-xl border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-muted/50"
          >
            Rejoin session
          </button>
        </div>
      </div>
    )
  }

  return (
    <WebRTCProvider roomId={ROOM_ID} userId="You">
      <MindMeshProvider
        sessionId={ROOM_ID}
        meetingTitle={MEETING_TITLE}
        visualizingEnabled={mindMeshActive}
      >
        <MindMeshSpeechBridge active />
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
          <div className="flex h-screen flex-col bg-background">
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
