"use client"

import { useEffect, useRef, useState } from "react"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import type { RemotePeer } from "@/hooks/use-webrtc"
import { Mic } from "lucide-react"

/**
 * Renders a video element whose srcObject is kept in sync with the stream,
 * or falls back to an initial-letter avatar if no stream is available.
 */
function VideoTile({
  stream,
  name,
  isLocal = false,
  isSpeaking = false,
  mirror = false,
  size = "small",
  isHost = false,
  onClick,
}: {
  stream?: MediaStream | null
  name: string
  isLocal?: boolean
  isSpeaking?: boolean
  mirror?: boolean
  size?: "large" | "small"
  isHost?: boolean
  onClick?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream ?? null
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
        /* No stream — initial avatar placeholder */
        <div className="flex h-full w-full items-center justify-center bg-neutral-100">
          <span
            className={`font-semibold text-neutral-400 select-none ${
              size === "large" ? "text-6xl" : "text-xl"
            }`}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      {/* Bottom gradient overlay */}
      {size === "large" && (
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
      )}
      {size === "small" && (
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/40 to-transparent" />
      )}

      {/* Name badge */}
      {size === "large" ? (
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          {isHost && (
            <span className="flex h-5 w-5 items-center justify-center">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-amber-300"
              >
                <path
                  d="m12 2 2.09 6.26L20 9.27l-4.91 3.82L16.18 20 12 16.77 7.82 20l1.09-6.91L4 9.27l5.91-1.01z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          <span className="rounded-md bg-black/40 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
            {name}
            {isHost ? " (Host)" : ""}
          </span>
          {isSpeaking && (
            <div className="flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-1 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              <span className="text-xs font-medium text-white">Speaking</span>
            </div>
          )}
        </div>
      ) : (
        <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5">
          <Mic className="h-3 w-3 text-white/80" />
          <span className="text-[11px] font-medium text-white/90">{name}</span>
        </div>
      )}

      {/* Click-to-pin overlay for rail tiles */}
      {onClick && (
        <button
          onClick={onClick}
          className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
          aria-label={`Pin ${name} as main speaker`}
        >
          <div className="flex h-full w-full items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <span className="rounded-md bg-black/50 px-3 py-1 text-[11px] font-medium text-white">
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
    (pinnedPeerId
      ? (remotePeers.find((p) => p.peerId === pinnedPeerId) ?? null)
      : null) ??
    remotePeers[0] ??
    null

  // Rail shows everyone except the main (pinned) peer
  const railPeers = remotePeers.filter((p) => p.peerId !== pinnedPeer?.peerId)

  // When no remote peers, show local stream as the main speaker
  const showLocalAsMain = !pinnedPeer

  return (
    <div className="flex h-full gap-4 bg-white p-4 md:gap-5 md:p-5">
      {error && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-red-100 bg-red-50 px-4 py-1.5 text-xs font-medium text-red-600 shadow-sm">
          {error}
        </div>
      )}

      {/* ── Main speaker ── */}
      <div className="flex flex-1 items-stretch">
        <div
          className="relative w-full overflow-hidden rounded-2xl bg-neutral-100 border border-neutral-200/80"
          style={{
            boxShadow:
              "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          {showLocalAsMain ? (
            <VideoTile
              stream={localStream}
              name="You"
              isLocal
              isHost
              isSpeaking={false}
              size="large"
              mirror
            />
          ) : (
            <VideoTile
              stream={pinnedPeer!.stream}
              name={pinnedPeer!.userId}
              isLocal={false}
              isSpeaking
              size="large"
            />
          )}
        </div>
      </div>

      {/* ── Right rail ── */}
      <div className="hidden w-52 shrink-0 flex-col gap-3 overflow-y-auto lg:flex xl:w-56">
        {railPeers.map((peer) => (
          <div
            key={peer.peerId}
            className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-neutral-100 border border-neutral-200/80"
            style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.02)" }}
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
        {/* Local camera in rail — only when a remote peer is the main speaker */}
        {!showLocalAsMain && (
          <div
            className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-neutral-100 border border-neutral-200/80"
            style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.02)" }}
          >
            <VideoTile
              stream={localStream}
              name="You"
              isLocal
              size="small"
              mirror
            />
          </div>
        )}
      </div>
    </div>
  )
}
