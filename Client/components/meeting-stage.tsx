"use client"

import { useEffect, useRef } from "react"
import { useWebRTCContext } from "@/hooks/webrtc-context"

// Renders a video element whose srcObject is kept in sync with the stream,
// or falls back to an initial-letter avatar if no stream is available.
function VideoTile({
  stream,
  name,
  isSpeaking = false,
  size = "small",
}: {
  stream?: MediaStream | null
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
      ) : (
        // No stream — show initial avatar placeholder
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

export default function MeetingStage() {
  const { localStream, remotePeers, error } = useWebRTCContext()

  return (
    <div className="flex h-full gap-4 p-4 md:gap-6 md:p-6">
      {/* Camera permission error banner */}
      {error && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-medium text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {/* Main speaker — first remote peer, or waiting placeholder */}
      <div className="flex flex-1 items-center justify-center">
        <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-slate-800 ring-1 ring-border/30">
          {remotePeers[0] ? (
            <VideoTile
              stream={remotePeers[0].stream}
              name={remotePeers[0].userId}
              isSpeaking
              size="large"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <p className="text-sm text-slate-400">Waiting for others to join…</p>
            </div>
          )}
        </div>
      </div>

      {/* Right participant rail — remaining remote peers + local "You" tile */}
      <div className="hidden w-44 shrink-0 flex-col gap-3 lg:flex xl:w-52">
        {remotePeers.slice(1).map((peer) => (
          <div
            key={peer.peerId}
            className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 ring-1 ring-border/30"
          >
            <VideoTile stream={peer.stream} name={peer.userId} size="small" />
          </div>
        ))}
        {/* Local camera — always last */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 ring-1 ring-border/30">
          <VideoTile stream={localStream} name="You" size="small" />
        </div>
      </div>
    </div>
  )
}
