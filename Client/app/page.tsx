"use client"

import { useState } from "react"
import { WebRTCProvider } from "@/hooks/webrtc-context"
import MeetingBar from "@/components/meeting-bar"
import MeetingBarStandby from "@/components/meeting-bar-standby"
import ParticipantStrip from "@/components/participant-strip"
import ProcessCanvas from "@/components/process-canvas"
import MeetingDock from "@/components/meeting-dock"
import MeetingStage from "@/components/meeting-stage"
import MeetingDockStandby from "@/components/meeting-dock-standby"

const ROOM_ID = "demo-room"

export default function MindMeshDemo() {
  const [mindMeshActive, setMindMeshActive] = useState(false)
  const [callEnded, setCallEnded] = useState(false)

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
        <div className="flex h-screen flex-col bg-background">
          <MeetingBar />
          <ParticipantStrip />
          <main className="relative flex-1 overflow-hidden">
            <ProcessCanvas />
            <MeetingDock onLeave={() => setCallEnded(true)} />
          </main>
        </div>
      )}
    </WebRTCProvider>
  )
}
