"use client"

import { Share2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWebRTCContext } from "@/hooks/webrtc-context"

export default function MeetingBarStandby() {
  const { remotePeers, isConnected } = useWebRTCContext()
  const participantCount = remotePeers.length + 1

  return (
    <header className="animate-bar-enter flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-card/80 px-4 backdrop-blur-md md:px-6">
      {/* Left section: Logo + Meeting title */}
      <div className="flex items-center gap-4 md:gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
            <svg
              className="h-4 w-4 text-primary-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="m4.93 4.93 2.83 2.83" />
              <path d="m16.24 16.24 2.83 2.83" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <path d="m4.93 19.07 2.83-2.83" />
              <path d="m16.24 7.76 2.83-2.83" />
            </svg>
          </div>
          <span className="hidden text-sm font-bold tracking-tight text-primary sm:block">MindMesh</span>
        </div>

        {/* Divider */}
        <div className="hidden h-5 w-px bg-border/50 md:block" />

        {/* Meeting title */}
        <h1 className="max-w-[180px] truncate text-sm font-medium text-foreground tracking-tight sm:max-w-xs md:max-w-md lg:max-w-lg">
          Enterprise Customer Onboarding Approval Flow
        </h1>

        {/* Live pill + Timer */}
        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex items-center gap-1.5 rounded-full bg-red-500/8 px-2.5 py-1 transition-colors">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-red-600">Live</span>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">23:41</span>
        </div>
      </div>

      {/* Right section: Participants + Standby badge + Share */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Participants */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {participantCount} {participantCount === 1 ? "participant" : "participants"}
          </span>
          {isConnected && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" title="Connected" />
          )}
        </div>

        {/* Standby Badge */}
        <div className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          <span className="text-xs font-semibold text-muted-foreground">MindMesh off</span>
        </div>

        {/* Share button */}
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 gap-1.5 rounded-lg border-border/60 text-secondary transition-all duration-200 hover:-translate-y-px hover:bg-muted/50 hover:shadow-sm"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
    </header>
  )
}
