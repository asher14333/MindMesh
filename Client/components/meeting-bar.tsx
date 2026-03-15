"use client"

import { ArrowLeft, Sparkles, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import { useMindMesh } from "@/lib/mindmesh/store"

interface MeetingBarProps {
  onBack?: () => void
}

export default function MeetingBar({ onBack }: MeetingBarProps) {
  const { remotePeers, isConnected } = useWebRTCContext()
  const { debug, connectionState } = useMindMesh()
  const canClear = connectionState === "open"
  // +1 for local "You"
  const participantCount = remotePeers.length + 1

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-card px-4 md:px-6">
      {/* Left section: Back button + Logo + Meeting title */}
      <div className="flex items-center gap-4 md:gap-6">
        {/* Back to cameras */}
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            title="Back to cameras"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
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
          <span className="hidden text-sm font-semibold text-primary sm:block">MindMesh</span>
        </div>

        {/* Divider */}
        <div className="hidden h-5 w-px bg-border md:block" />

        {/* Meeting title */}
        <h1 className="max-w-[180px] truncate text-sm font-medium text-foreground sm:max-w-xs md:max-w-md lg:max-w-lg">
          Enterprise Customer Onboarding Approval Flow
        </h1>

        {/* Live pill + Timer */}
        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-medium text-red-600">Live</span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">23:41</span>
        </div>
      </div>

      {/* Right section: Participants + AI badge + Share */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Participants */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {participantCount} {participantCount === 1 ? "participant" : "participants"}
          </span>
          {isConnected && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Connected" />
          )}
        </div>

        {/* AI Badge */}
        <div className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2.5 py-1 md:flex">
          <Sparkles className="h-3 w-3 text-accent" />
          <span className="text-xs font-medium text-secondary">AI translating</span>
        </div>

        {/* Clear canvas */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!canClear}
          onClick={() => debug.resetDiagram()}
          className="h-8 gap-1.5 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          title="Clear canvas"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </Button>
      </div>
    </header>
  )
}
