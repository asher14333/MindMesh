"use client"

import { useEffect, useRef } from "react"
import { useWebRTC } from "@/hooks/use-webrtc"

// Static fallback data for demo participants
const STATIC_PARTICIPANTS = [
  {
    name: "Sarah Chen",
    image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=300&fit=crop&crop=face",
    speaking: true,
  },
  {
    name: "Marcus Johnson",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=150&fit=crop&crop=face",
  },
  {
    name: "Elena Rodriguez",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=150&fit=crop&crop=face",
  },
  {
    name: "David Kim",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=150&fit=crop&crop=face",
  },
]

// Renders a video element whose srcObject is kept in sync with the stream,
// or falls back to a static image if no stream is provided.
function VideoTile({
  stream,
  fallbackSrc,
  name,
  isSpeaking = false,
  size = "small",
}: {
  stream?: MediaStream | null
  fallbackSrc?: string
  name: string
  isSpeaking?: boolean
  size?: "large" | "small"
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (stream) {
      el.srcObject = stream
    } else {
      el.srcObject = null
    }
  }, [stream])

  const nameClass =
    size === "large"
      ? "rounded-md bg-black/40 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm"
      : "text-[10px] font-medium text-white/90"

  return (
    <>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={name === "You"}
          className="h-full w-full object-cover"
        />
      ) : fallbackSrc ? (
        <img src={fallbackSrc} alt={name} className="h-full w-full object-cover" />
      ) : (
        // No stream and no image — show initial avatar placeholder
        <div className="flex h-full w-full items-center justify-center bg-slate-700">
          <span className="text-2xl font-semibold text-slate-300 select-none">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      {size === "large" && (
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
      )}
      {size === "small" && (
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/50 to-transparent" />
      )}

      <div className={size === "large" ? "absolute bottom-4 left-4 flex items-center gap-2" : undefined}>
        {size === "large" ? (
          <>
            <span className={nameClass}>{name}</span>
            {isSpeaking && (
              <div className="flex items-center gap-1.5 rounded-md bg-accent/90 px-2 py-1 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                <span className="text-xs font-medium text-white">Speaking</span>
              </div>
            )}
          </>
        ) : (
          <span className={`absolute bottom-1.5 left-2 ${nameClass}`}>{name}</span>
        )}
      </div>
    </>
  )
}

export default function MeetingStage({ roomId = "demo-room" }: { roomId?: string }) {
  const { localStream, remotePeers, error } = useWebRTC(roomId, "You")

  // Map remote peer streams by index to the static participant list for fallback labels/images
  const activeSpeaker = STATIC_PARTICIPANTS[0]
  const railParticipants = [
    ...STATIC_PARTICIPANTS.slice(1),
    { name: "You", image: undefined as string | undefined },
  ]

  return (
    <div className="flex h-full gap-4 p-4 md:gap-6 md:p-6">
      {/* Camera permission error banner */}
      {error && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-medium text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {/* Main speaker (active speaker — first remote peer or static fallback) */}
      <div className="flex flex-1 items-center justify-center">
        <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-slate-800 ring-1 ring-border/30">
          <VideoTile
            stream={remotePeers[0]?.stream ?? null}
            fallbackSrc={activeSpeaker.image}
            name={remotePeers[0]?.userId ?? activeSpeaker.name}
            isSpeaking={activeSpeaker.speaking}
            size="large"
          />
        </div>
      </div>

      {/* Right participant rail */}
      <div className="hidden w-44 shrink-0 flex-col gap-3 lg:flex xl:w-52">
        {railParticipants.map((participant, index) => {
          const isLocalSlot = participant.name === "You"
          // Map remaining remote peers (index 1+) to static slots
          const remotePeer = isLocalSlot ? null : remotePeers[index + 1] ?? null

          return (
            <div
              key={participant.name}
              className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 ring-1 ring-border/30"
            >
              <VideoTile
                stream={isLocalSlot ? localStream : remotePeer?.stream ?? null}
                fallbackSrc={participant.image}
                name={isLocalSlot ? "You" : remotePeer?.userId ?? participant.name}
                size="small"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
