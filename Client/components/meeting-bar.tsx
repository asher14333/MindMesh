"use client"

import Image from "next/image"
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
  const participantCount = remotePeers.length + 1

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5 md:px-6">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Back to cameras */}
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            title="Back to cameras"
            className="h-8 w-8 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Logo */}
        <Image
          src="/horizontalIconTransparent.png"
          alt="MindMesh"
              width={140}
              height={35}
          priority
          style={{ objectFit: "contain" }}
        />

        {/* Divider */}
        <div className="hidden h-5 w-px bg-neutral-200 md:block" />

        {/* Meeting title */}
        <h1 className="hidden max-w-[180px] truncate text-sm font-medium text-neutral-600 sm:block md:max-w-md">
          Enterprise Customer Onboarding Approval Flow
        </h1>

        {/* Live pill */}
        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">Live</span>
          </div>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Participants */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <Users className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-xs text-neutral-500">
            {participantCount}{" "}
            {participantCount === 1 ? "participant" : "participants"}
          </span>
          {isConnected && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              title="Connected"
            />
          )}
        </div>

        {/* AI Badge */}
        <div className="hidden items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 md:flex">
          <Sparkles className="h-3 w-3 text-neutral-900" />
          <span className="text-xs font-medium text-neutral-600">
            AI translating
          </span>
        </div>

        {/* Clear canvas */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!canClear}
          onClick={() => debug.resetDiagram()}
          className="h-8 gap-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          title="Clear canvas"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </Button>
      </div>
    </header>
  )
}
