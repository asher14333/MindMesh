"use client"

import { useEffect, useRef, useState } from "react"
import { useWebRTCContext } from "@/hooks/webrtc-context"
import type { RemotePeer } from "@/hooks/use-webrtc"

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

  const nameClass =
    size === "large"
      ? "rounded-lg bg-black/40 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm"
      : "text-[10px] font-medium text-white/90"

  return (
    <>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover transition-opacity duration-300"
          style={mirror ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
          <span className="text-2xl font-bold text-slate-300/80 select-none">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      {size === "large" && (
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
      )}
      {size === "small" && (
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/50 to-transparent" />
      )}

      <div className={size === "large" ? "absolute bottom-4 left-4 flex items-center gap-2" : undefined}>
        {size === "large" ? (
          <>
            <span className={nameClass}>{name}</span>
            {isSpeaking && (
              <div className="flex items-center gap-1.5 rounded-lg bg-accent/90 px-2.5 py-1 backdrop-blur-sm animate-fade-in">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                <span className="text-xs font-semibold text-white">Speaking</span>
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
          className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 transition-all duration-200"
          aria-label={`Pin ${name} as main speaker`}
        >
          <div className="flex h-full w-full items-center justify-center bg-black/25 backdrop-blur-[2px]">
            <span className="rounded-lg bg-white/20 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm border border-white/10">
              Pin speaker
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

  const pinnedPeer: RemotePeer | null =
    (pinnedPeerId ? remotePeers.find((p) => p.peerId === pinnedPeerId) ?? null : null) ??
    remotePeers[0] ??
    null

  const railPeers = remotePeers.filter((p) => p.peerId !== pinnedPeer?.peerId)

  return (
    <div className="animate-fade-in flex h-full gap-4 p-4 md:gap-6 md:p-6">
      {error && (
        <div className="animate-fade-in-down absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-2 text-xs font-semibold text-red-700 shadow-lg shadow-red-500/10 backdrop-blur-sm">
          {error}
        </div>
      )}

      {/* Main speaker */}
      <div className="flex flex-1 items-center justify-center">
        <div className="animate-scale-in relative aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-slate-800 ring-1 ring-white/10 shadow-xl shadow-black/10">
          {pinnedPeer ? (
            <VideoTile
              stream={pinnedPeer.stream}
              name={pinnedPeer.userId}
              isLocal={false}
              isSpeaking
              size="large"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-700 to-slate-800">
              <div className="animate-float rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                <svg className="h-6 w-6 text-slate-300/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-400">Waiting for others to join...</p>
              <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-xs text-slate-500">Room is ready</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right rail */}
      <div className="hidden w-44 shrink-0 flex-col gap-3 lg:flex xl:w-52">
        {railPeers.map((peer, i) => (
          <div
            key={peer.peerId}
            className="animate-tile-pop relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 ring-1 ring-white/10 shadow-md transition-all duration-200 hover:ring-2 hover:ring-accent/40 hover:shadow-lg"
            style={{ animationDelay: `${i * 75}ms` }}
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
        <div className="animate-tile-pop relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 ring-1 ring-white/10 shadow-md transition-all duration-200 hover:ring-2 hover:ring-accent/40"
          style={{ animationDelay: `${railPeers.length * 75}ms` }}
        >
          <VideoTile stream={localStream} name="You" isLocal size="small" mirror />
        </div>
      </div>
    </div>
  )
}
