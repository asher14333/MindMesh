"use client"

import { useEffect, useRef, useState } from "react"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import type { RemotePeer } from "@/hooks/use-webrtc"

// Renders a video element whose srcObject is kept in sync with the stream,
// or falls back to an initial-letter avatar if no stream is available.
function VideoTile({
  stream,
  name,
  isLocal = false,
  isSpeaking = false,
  mirror = false,
  size = "small",
  onClick,
}: {
  stream?: MediaStream | null
  name: string
  isLocal?: boolean
  isSpeaking?: boolean
  mirror?: boolean
  size?: "large" | "small"
  onClick?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream ?? null
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
          className="h-full w-full object-cover"
          style={mirror ? { transform: "scaleX(-1)" } : undefined}
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

      {/* Click-to-pin overlay for rail tiles */}
      {onClick && (
        <button
          onClick={onClick}
          className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
          aria-label={`Pin ${name} as main speaker`}
        >
          <div className="flex h-full w-full items-center justify-center bg-black/30">
            <span className="rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium text-white">
              Pin
            </span>
          </div>
        </button>
      )}
    </>
  )
}

export default function MeetingStage() {
  const { localStream, remotePeers, error } = useWebRTCContext()
  const [pinnedPeerId, setPinnedPeerId] = useState<string | null>(null)

  // Resolve pinned peer; fall back to first remote peer
  const pinnedPeer: RemotePeer | null =
    (pinnedPeerId ? remotePeers.find((p) => p.peerId === pinnedPeerId) ?? null : null) ??
    remotePeers[0] ??
    null

  // Rail shows everyone except the main (pinned) peer
  const railPeers = remotePeers.filter((p) => p.peerId !== pinnedPeer?.peerId)

  return (
    <div className="flex h-full gap-4 p-4 md:gap-6 md:p-6">
      {error && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-medium text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {/* Main speaker */}
      <div className="flex flex-1 items-center justify-center">
        <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-slate-800 ring-1 ring-border/30">
          {pinnedPeer ? (
            <VideoTile
              stream={pinnedPeer.stream}
              name={pinnedPeer.userId}
              isLocal={false}
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

      {/* Right rail */}
      <div className="hidden w-44 shrink-0 flex-col gap-3 lg:flex xl:w-52">
        {railPeers.map((peer) => (
          <div
            key={peer.peerId}
            className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 ring-1 ring-border/30"
          >
            <VideoTile
              stream={peer.stream}
              name={peer.userId}
              isLocal={false}
              size="small"
              onClick={() => setPinnedPeerId(peer.peerId)}
            />
          </div>
        ))}
        {/* Local camera — mirrored, always last */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 ring-1 ring-border/30">
          <VideoTile stream={localStream} name="You" isLocal size="small" mirror />
        </div>
      </div>
    </div>
  )
}
