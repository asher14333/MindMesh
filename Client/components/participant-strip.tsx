"use client"

import { useEffect, useRef } from "react"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import type { RemotePeer } from "@/hooks/use-webrtc"

function PeerTile({
  stream,
  name,
  isLocal = false,
  speaking = false,
}: {
  stream: MediaStream | null
  name: string
  isLocal?: boolean
  speaking?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    // Only mute our own feed — never mute remote peers.
    // Do NOT use name === 'You': every peer may share the same display name.
    el.muted = isLocal
    el.volume = 1.0
    if (stream) {
      // Explicit play() — autoPlay alone is unreliable for unmuted media.
      // If the browser blocks it (NotAllowedError / autoplay policy), register a
      // one-time click listener so the next user interaction unlocks audio.
      el.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          const unlock = () => { el.play().catch(() => {}); document.removeEventListener("click", unlock) }
          document.addEventListener("click", unlock)
        }
      })
    }
  }, [stream, isLocal])

  return (
    <div
      className={`relative h-24 w-36 overflow-hidden rounded-xl bg-slate-800 ${
        speaking
          ? "ring-2 ring-accent ring-offset-2 ring-offset-muted/30"
          : "ring-1 ring-border/40"
      }`}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-2xl font-semibold text-slate-300 select-none">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/60 to-transparent" />
      <span className="absolute bottom-1 left-2 text-[10px] font-medium text-white/90">{name}</span>
    </div>
  )
}

export default function ParticipantStrip() {
  const { localStream, remotePeers } = useWebRTCContext()

  return (
    <div className="shrink-0 border-b border-border/40 bg-muted/30 px-4 py-3 md:px-6">
      <div className="flex items-center justify-center gap-3 md:gap-4">
        <div className="relative flex flex-col items-center gap-1">
          <PeerTile stream={localStream} name="You" isLocal />
        </div>
        {remotePeers.map((peer: RemotePeer) => (
          <div key={peer.peerId} className="relative flex flex-col items-center gap-1">
            <PeerTile stream={peer.stream} name={peer.userId} isLocal={false} />
          </div>
        ))}
      </div>
    </div>
  )
}
