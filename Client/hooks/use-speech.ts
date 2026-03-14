"use client"

/**
 * useSpeech — browser speech-to-text via the Web Speech API.
 *
 * What it does:
 *  1. Starts SpeechRecognition when `active` is true.
 *  2. Logs every partial and final result to the **browser console** so you
 *     can verify your mic is working without needing any UI.
 *  3. Sends `speech.partial` and `speech.final` events to the backend
 *     diagram pipeline WebSocket at /ws/{sessionId} so the backend can
 *     generate diagrams from your speech.
 *
 * Console output (open DevTools → Console):
 *   🎤 partial  "first sales hands off to"
 *   🎤 FINAL    "first sales hands off to solutions engineering."
 */

import { useEffect, useRef } from "react"

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/^http/, "ws") ?? "ws://localhost:8000"

// Minimal types for the Web Speech API (not in standard lib.dom.d.ts in all TS versions)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}
interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

export function useSpeech(sessionId: string, active: boolean, visualizing: boolean = false) {
  // Keep a stable ref to the pipeline WebSocket so it survives re-renders
  const pipelineWsRef = useRef<WebSocket | null>(null)
  // Track the latest visualizing value without restarting the whole effect
  const visualizingRef = useRef(visualizing)
  useEffect(() => { visualizingRef.current = visualizing }, [visualizing])

  // When MindMesh is toggled on mid-session, send the command over the open WS
  useEffect(() => {
    const ws = pipelineWsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type: "ui.command",
      command: "visualize.toggle",
      payload: { enabled: visualizing },
    }))
  }, [visualizing])

  useEffect(() => {
    if (!active) return

    // ── 1. Connect to the backend diagram pipeline ──────────────────────────
    const ws = new WebSocket(`${WS_BASE}/ws/${sessionId}`)
    pipelineWsRef.current = ws

    ws.onopen = () => {
      console.log("[MindMesh] pipeline WebSocket connected →", `${WS_BASE}/ws/${sessionId}`)
      ws.send(JSON.stringify({ type: "session.start", meeting_title: "Live Meeting" }))
      // Only enable diagram generation if we're already in MindMesh view
      if (visualizingRef.current) {
        ws.send(JSON.stringify({ type: "ui.command", command: "visualize.toggle", payload: { enabled: true } }))
      }
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        // Log diagram events so you can see generation happening in the console
        if (msg.type === "diagram.replace") {
          console.log("[MindMesh] diagram.replace — nodes:", msg.diagram?.nodes?.length ?? 0)
        } else if (msg.type === "diagram.patch") {
          console.log("[MindMesh] diagram.patch — ops:", msg.patch?.ops?.length ?? 0)
        } else if (msg.type === "intent.result") {
          console.log("[MindMesh] intent:", msg.result?.diagram_type, "confidence:", msg.result?.confidence)
        } else if (msg.type === "error") {
          console.warn("[MindMesh] backend error:", msg.message)
        }
      } catch {
        // non-JSON frame — ignore
      }
    }

    ws.onerror = () => console.error("[MindMesh] pipeline WebSocket error")
    ws.onclose = () => console.log("[MindMesh] pipeline WebSocket closed")

    // ── 2. Start SpeechRecognition ──────────────────────────────────────────
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) {
      console.warn("[MindMesh] SpeechRecognition not supported in this browser (use Chrome/Edge)")
      return () => { ws.close(); pipelineWsRef.current = null }
    }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true   // partial results
    recognition.lang = "en-US"

    let restartTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0].transcript.trim()
        if (!text) continue

        if (result.isFinal) {
          console.log(`🎤 FINAL    "${text}"`)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "speech.final", text }))
          }
        } else {
          console.log(`🎤 partial  "${text}"`)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "speech.partial", text }))
          }
        }
      }
    }

    recognition.onerror = (e: Event) => {
      const err = (e as Event & { error?: string }).error
      // "no-speech" is benign — browser just timed out waiting, we restart
      if (err !== "no-speech") {
        console.warn("[MindMesh] SpeechRecognition error:", err)
      }
    }

    // Auto-restart: continuous mode still stops after ~60 s of silence in
    // some browsers (Chrome). Restart it immediately so recognition is always on.
    recognition.onend = () => {
      if (!stopped) {
        restartTimer = setTimeout(() => {
          try { recognition.start() } catch { /* already started */ }
        }, 150)
      }
    }

    recognition.start()
    console.log("[MindMesh] SpeechRecognition started — speak and watch this console")

    return () => {
      stopped = true
      if (restartTimer) clearTimeout(restartTimer)
      try { recognition.abort() } catch { /* already stopped */ }
      ws.close()
      pipelineWsRef.current = null
    }
  }, [active, sessionId])
}
