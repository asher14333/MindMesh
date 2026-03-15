"use client"

import { useEffect, useRef } from "react"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import type { RemotePeer } from "@/hooks/use-webrtc"

function PeerTile({
  stream,
  name,
  isLocal = false,
  speaking = false,
  index = 0,
}: {
  stream: MediaStream | null
  name: string
  isLocal?: boolean
  speaking?: boolean
  index?: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    el.muted = isLocal
    el.volume = 1.0
    if (stream) {
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
      className={`animate-tile-pop relative h-24 w-36 overflow-hidden rounded-xl bg-slate-800 transition-all duration-300 ${
        speaking
          ? "ring-2 ring-accent ring-offset-2 ring-offset-muted/30 shadow-lg shadow-accent/10"
          : "ring-1 ring-white/10 hover:ring-2 hover:ring-accent/30"
      }`}
      style={{ animationDelay: `${index * 75}ms` }}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
          <span className="text-2xl font-bold text-slate-300/80 select-none">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/50 to-transparent" />
      <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-white/90">{name}</span>
      {speaking && (
        <div className="absolute right-1.5 top-1.5">
          <span className="flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
        </div>
      )}
    </div>
  )
}

export default function ParticipantStrip() {
  const { localStream, remotePeers } = useWebRTCContext()

  return (
    <div className="animate-strip-enter shrink-0 border-b border-border/30 bg-muted/20 px-4 py-3.5 backdrop-blur-sm md:px-6">
      <div className="flex items-center justify-center gap-3 md:gap-4">
        <div className="relative flex flex-col items-center gap-1">
          <PeerTile stream={localStream} name="You" isLocal index={0} />
        </div>
        {remotePeers.map((peer: RemotePeer, i: number) => (
          <div key={peer.peerId} className="relative flex flex-col items-center gap-1">
            <PeerTile stream={peer.stream} name={peer.userId} isLocal={false} index={i + 1} />
          </div>
        ))}
      </div>
    </div>
  )
}
