"use client"

import Image from "next/image"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWebRTCContext } from "@/hooks/webrtc-context"

const AVATAR_COLORS = [
  "bg-stone-400",
  "bg-neutral-500",
  "bg-zinc-400",
  "bg-stone-500",
  "bg-neutral-400",
]

export default function MeetingBarStandby() {
  const { remotePeers, isConnected } = useWebRTCContext()

  const allParticipants = [
    { name: "You", id: "local" },
    ...remotePeers.map((p) => ({ name: p.userId, id: p.peerId })),
  ]
  const MAX_AVATARS = 4
  const visibleAvatars = allParticipants.slice(0, MAX_AVATARS)
  const overflow = Math.max(0, allParticipants.length - MAX_AVATARS)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5 md:px-6">
      {/* Left: Logo + Divider + Meeting title */}
      <div className="flex items-center gap-4">
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
        <h1 className="hidden max-w-[180px] truncate text-sm font-medium text-neutral-600 md:block lg:max-w-md">
          Enterprise Customer Onboarding Approval Flow
        </h1>
      </div>

      {/* Right: Avatar cluster + Invite + Profile */}
      <div className="flex items-center gap-3">
        {/* Overlapping avatar cluster */}
        <div className="hidden items-center sm:flex">
          <div className="flex -space-x-2">
            {visibleAvatars.map((p, i) => (
              <div
                key={p.id}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-[11px] font-semibold text-white`}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          {overflow > 0 && (
            <div className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-[11px] font-semibold text-neutral-500">
              +{overflow}
            </div>
          )}
        </div>

        {/* Invite button */}
        <Button className="h-8 gap-1.5 rounded-lg bg-neutral-900 px-3.5 text-xs font-semibold text-white hover:bg-neutral-800">
          <UserPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Invite</span>
        </Button>

        {/* Profile avatar */}
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200">
          <span className="text-xs font-semibold text-neutral-500">Y</span>
          {isConnected && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
          )}
        </div>
      </div>
    </header>
  )
}
