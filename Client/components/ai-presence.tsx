"use client"

import { Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

export function AIPresence() {
  const [intensity, setIntensity] = useState<"idle" | "listening" | "processing">("idle")

  // Simulate AI state changes for demo purposes
  // In a real app, this would be driven by the websocket or state store
  useEffect(() => {
    const interval = setInterval(() => {
      setIntensity((prev) => {
        if (prev === "idle") return "listening"
        if (prev === "listening") return "processing"
        return "idle"
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 transition-all duration-700 ease-out backdrop-blur-md ${
          intensity === "idle"
            ? "bg-white/5 border border-white/10 opacity-0 scale-90"
            : intensity === "listening"
            ? "bg-indigo-500/10 border border-indigo-500/20 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
            : "bg-teal-500/10 border border-teal-500/20 shadow-[0_0_20px_-3px_rgba(20,184,166,0.3)]"
        }`}
      >
        <div className="relative flex items-center justify-center w-4 h-4">
          <Sparkles
            className={`w-3.5 h-3.5 transition-colors duration-500 ${
              intensity === "processing" ? "text-teal-400" : "text-indigo-400"
            }`}
          />
          {/* Pulse rings */}
          <div
            className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
              intensity === "processing" ? "bg-teal-400" : "bg-indigo-400"
            }`}
          />
        </div>
        
        <span
          className={`text-xs font-medium tracking-wide transition-colors duration-500 ${
            intensity === "processing" ? "text-teal-200" : "text-indigo-200"
          }`}
        >
          {intensity === "listening" ? "MindMesh Listening..." : "Processing Ideas..."}
        </span>
      </div>
    </div>
  )
}
