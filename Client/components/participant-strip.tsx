"use client"

import { useEffect, useRef } from "react"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import type { RemotePeer } from "@/hooks/use-webrtc"
import { Mic } from "lucide-react"

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
    el.muted = isLocal
    el.volume = 1.0
    if (stream) {
      el.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          const unlock = () => {
            el.play().catch(() => {})
            document.removeEventListener("click", unlock)
          }
          document.addEventListener("click", unlock)
        }
      })
    }
  }, [stream, isLocal])

  return (
    <div
      className={`relative h-[72px] w-[108px] overflow-hidden rounded-xl bg-neutral-100 ${
        speaking
          ? "ring-2 ring-neutral-900 ring-offset-2 ring-offset-white"
          : "border border-neutral-200/80"
      }`}
      style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.02)" }}
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
          <span className="text-lg font-semibold text-neutral-400 select-none">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/40 to-transparent" />
      <div className="absolute bottom-1.5 left-2 flex items-center gap-1">
        <Mic className="h-2.5 w-2.5 text-white/80" />
        <span className="text-[10px] font-medium text-white/90">{name}</span>
      </div>
    </div>
  )
}

export default function ParticipantStrip() {
  const { localStream, remotePeers } = useWebRTCContext()

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-2.5 md:px-6">
      <div className="flex items-center justify-center gap-3 md:gap-3.5">
        <PeerTile stream={localStream} name="You" isLocal />
        {remotePeers.map((peer: RemotePeer) => (
          <PeerTile
            key={peer.peerId}
            stream={peer.stream}
            name={peer.userId}
            isLocal={false}
          />
        ))}
      </div>
    </div>
  )
}
