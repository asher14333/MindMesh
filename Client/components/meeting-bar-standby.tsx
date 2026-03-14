"use client"

import { Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const participants = [
  { name: "Sarah Chen", initials: "SC", color: "bg-sky-600" },
  { name: "Marcus Johnson", initials: "MJ", color: "bg-slate-700" },
  { name: "Elena Rodriguez", initials: "ER", color: "bg-teal-600" },
  { name: "David Kim", initials: "DK", color: "bg-indigo-600" },
  { name: "You", initials: "YO", color: "bg-rose-600" },
]

export default function MeetingBarStandby() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-card px-4 md:px-6">
      {/* Left section: Logo + Meeting title */}
      <div className="flex items-center gap-4 md:gap-6">
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

      {/* Right section: Participants + Standby badge + Share */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Participants */}
        <div className="hidden items-center sm:flex">
          <div className="flex -space-x-2">
            {participants.map((participant, index) => (
              <div
                key={participant.name}
                className={`flex h-7 w-7 items-center justify-center rounded-full ${participant.color} text-[10px] font-medium text-white ring-2 ring-card`}
                style={{ zIndex: participants.length - index }}
                title={participant.name}
              >
                {participant.initials}
              </div>
            ))}
          </div>
        </div>

        {/* Standby Badge */}
        <div className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2.5 py-1 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
          <span className="text-xs font-medium text-muted-foreground">MindMesh off</span>
        </div>

        {/* Share button */}
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 gap-1.5 border-border/80 text-secondary hover:bg-muted/50"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
    </header>
  )
}
