"use client"

/**
 * useSpeech — browser speech-to-text via the Web Speech API.
 *
 * What it does:
 *  1. Starts SpeechRecognition when `active` is true.
 *  2. Logs your own speech and all remote speakers to the browser console.
 *  3. Sends speech events tagged with a `speaker` id to the backend pipeline.
 *  4. Listens for transcript.update broadcasts from OTHER speakers and labels
 *     them automatically as Person 1, Person 2, Person 3, etc.
 *
 * Console output (DevTools → Console):
 *   🎤 You (partial)  "first sales hands off to"
 *   🎤 You (FINAL)    "first sales hands off to solutions engineering."
 *   🗣️ Person 1 (FINAL) "then security reviews the compliance setup."
 */

import { useEffect, useRef } from "react"

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/^http/, "ws") ?? "ws://localhost:8000"

// Stable random speaker ID for this browser tab — survives re-renders
function makeSpeakerId() {
  return `spk-${Math.random().toString(36).slice(2, 10)}`
}

// Minimal types for the Web Speech API
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

// Module-level speaker ID so it persists across hot reloads
const MY_SPEAKER_ID = makeSpeakerId()

export function useSpeech(sessionId: string, active: boolean, visualizing: boolean = false) {
  const pipelineWsRef = useRef<WebSocket | null>(null)
  const visualizingRef = useRef(visualizing)
  useEffect(() => { visualizingRef.current = visualizing }, [visualizing])

  // speaker_id → "Person N" label map, shared across renders via ref
  const speakerLabelsRef = useRef<Map<string, string>>(new Map())
  const speakerCountRef = useRef(0)

  function labelFor(speakerId: string): string {
    if (!speakerLabelsRef.current.has(speakerId)) {
      speakerCountRef.current += 1
      speakerLabelsRef.current.set(speakerId, `Person ${speakerCountRef.current}`)
    }
    return speakerLabelsRef.current.get(speakerId)!
  }

  // When MindMesh is toggled on mid-session, send visualize.toggle immediately
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
      console.log("[MindMesh] your speaker id:", MY_SPEAKER_ID)
      ws.send(JSON.stringify({ type: "session.start", meeting_title: "Live Meeting" }))
      if (visualizingRef.current) {
        ws.send(JSON.stringify({ type: "ui.command", command: "visualize.toggle", payload: { enabled: true } }))
      }
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as Record<string, unknown>

        if (msg.type === "transcript.update") {
          const speaker = msg.speaker as string | undefined
          const text = msg.text as string
          const isFinal = msg.is_final as boolean

          if (!speaker || speaker === MY_SPEAKER_ID) {
            // Our own echo — already logged at send time, skip
            return
          }

          // Remote speaker — label and log finals only
          if (isFinal) {
            const label = labelFor(speaker)
            console.log(`🗣️ ${label} (FINAL)  "${text}"`)
          }
          return
        }

        if (msg.type === "diagram.replace") {
          console.log("[MindMesh] diagram.replace — nodes:", (msg.diagram as Record<string, unknown[]>)?.nodes?.length ?? 0)
        } else if (msg.type === "diagram.patch") {
          console.log("[MindMesh] diagram.patch — ops:", (msg.patch as Record<string, unknown[]>)?.ops?.length ?? 0)
        } else if (msg.type === "intent.result") {
          const r = msg.result as Record<string, unknown>
          console.log("[MindMesh] intent:", r?.diagram_type, "confidence:", r?.confidence)
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
    recognition.interimResults = true
    recognition.lang = "en-US"

    let restartTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0].transcript.trim()
        if (!text) continue

        if (result.isFinal) {
          console.log(`🎤 You (FINAL)    "${text}"`)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "speech.final", text, speaker: MY_SPEAKER_ID }))
          }
        } else {
          console.log(`🎤 You (partial)  "${text}"`)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "speech.partial", text, speaker: MY_SPEAKER_ID }))
          }
        }
      }
    }

    recognition.onerror = (e: Event) => {
      const err = (e as Event & { error?: string }).error
      if (err !== "no-speech") {
        console.warn("[MindMesh] SpeechRecognition error:", err)
      }
    }

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
