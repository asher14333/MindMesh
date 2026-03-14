"use client"

import { useState } from "react"
import MeetingBar from "@/components/meeting-bar"
import MeetingBarStandby from "@/components/meeting-bar-standby"
import ParticipantStrip from "@/components/participant-strip"
import ProcessCanvas from "@/components/process-canvas"
import MeetingDock from "@/components/meeting-dock"
import MeetingStage from "@/components/meeting-stage"
import MeetingDockStandby from "@/components/meeting-dock-standby"

export default function MindMeshDemo() {
  const [mindMeshActive, setMindMeshActive] = useState(false)

  if (!mindMeshActive) {
    // Standby state - regular meeting view
    return (
      <div className="flex h-screen flex-col bg-background">
        <MeetingBarStandby />
        <main className="relative flex-1 overflow-hidden">
          <MeetingStage />
          <MeetingDockStandby onActivate={() => setMindMeshActive(true)} />
        </main>
      </div>
    )
  }

  // Active state - MindMesh visual canvas
  return (
    <div className="flex h-screen flex-col bg-background">
      <MeetingBar />
      <ParticipantStrip />
      <main className="relative flex-1 overflow-hidden">
        <ProcessCanvas />
        <MeetingDock />
      </main>
    </div>
  )
}
