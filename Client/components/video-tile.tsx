"use client"

import { useEffect, useRef } from "react"
import { MicOff } from "lucide-react"

export interface VideoTileProps {
  stream?: MediaStream | null
  name: string
  isLocal?: boolean
  isSpeaking?: boolean
  mirror?: boolean
  className?: string
  variant?: "default" | "minimal"
}

export function VideoTile({
  stream,
  name,
  isLocal = false,
  isSpeaking = false,
  mirror = false,
  className = "",
  variant = "default",
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream ?? null
    el.muted = isLocal
    
    if (stream) {
      el.play().catch((err) => {
        if (err.name === "NotAllowedError") {
          const unlock = () => { el.play().catch(() => {}); document.removeEventListener("click", unlock) }
          document.addEventListener("click", unlock)
        }
      })
    }
  }, [stream, isLocal])

  if (variant === "minimal") {
    return (
      <div className={`relative overflow-hidden rounded-xl bg-slate-900 ring-1 ring-white/10 transition-all ${className} ${isSpeaking ? 'ring-2 ring-indigo-500 shadow-md shadow-indigo-500/20' : ''}`}>
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`h-full w-full object-cover ${mirror ? "-scale-x-100" : ""}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/80">
              {name.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <span className="text-[10px] font-medium text-white/90 truncate block">{name}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-slate-900 transition-all duration-300 ring-1 ring-white/10 ${className} ${isSpeaking ? 'ring-2 ring-indigo-500 shadow-[0_0_30px_-10px_rgba(99,102,241,0.3)]' : ''}`}>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`h-full w-full object-cover transition-transform duration-500 ${mirror ? "-scale-x-100" : ""}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/5 text-2xl font-semibold text-white/80 ring-1 ring-white/10 backdrop-blur-sm">
            {name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Gradient Overlay */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60" />

      {/* Name Label */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-md transition-opacity duration-300 hover:bg-black/60">
          <span className="text-sm font-medium text-white/90 drop-shadow-sm">{name} {isLocal && "(You)"}</span>
        </div>
        
        {/* Status Indicators */}
        <div className="flex gap-2">
           {!stream && <MicOff className="h-4 w-4 text-white/50" />} 
           {isSpeaking && (
             <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/90 backdrop-blur-sm shadow-sm shadow-indigo-500/50">
               <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
             </div>
           )}
        </div>
      </div>
    </div>
  )
}
