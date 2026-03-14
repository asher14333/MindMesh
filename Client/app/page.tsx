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

  return (
    <WebRTCProvider roomId={ROOM_ID} userId="You">
      {!mindMeshActive ? (
        <div className="flex h-screen flex-col bg-background">
          <MeetingBarStandby />
          <main className="relative flex-1 overflow-hidden">
            <MeetingStage />
            <MeetingDockStandby onActivate={() => setMindMeshActive(true)} />
          </main>
        </div>
      ) : (
        <div className="flex h-screen flex-col bg-background">
          <MeetingBar />
          <ParticipantStrip />
          <main className="relative flex-1 overflow-hidden">
            <ProcessCanvas />
            <MeetingDock />
          </main>
        </div>
      )}
    </WebRTCProvider>
  )
}
