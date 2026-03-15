"use client"

/**
 * useSpeech — browser speech-to-text via the Web Speech API.
 *
 * What it does:
 *  1. Starts SpeechRecognition when `active` is true.
 *  2. Logs your own speech and all remote speakers to the browser console.
 *  3. Keeps interim hypotheses local-only and sends finalized speech tagged
 *     with a per-tab `speaker` id through the shared MindMesh WebSocket session.
 *
 * Console output (DevTools → Console):
 *   🎤 You (partial)  "first sales hands off to"
 *   🎤 You (FINAL)    "first sales hands off to solutions engineering."
 *   🗣️ Person 1 (FINAL) "then security reviews the compliance setup."
 */

import { useEffect, useEffectEvent, useRef } from "react"
import type { ClientEvent, TranscriptUpdateEvent } from "@/lib/mindmesh/events"

function makeSpeakerId() {
  return `spk-${Math.random().toString(36).slice(2, 10)}`
}

const FINAL_DEBOUNCE_MS = 600
const CONNECTOR_ONLY_FINALS = new Set([
  "first",
  "then",
  "next",
  "finally",
  "after",
  "before",
  "once",
])

function normalizeSpeechFragment(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function comparisonKey(text: string) {
  return normalizeSpeechFragment(text)
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "")
}

function pickLongerFinal(a: string, b: string) {
  return normalizeSpeechFragment(a).length >= normalizeSpeechFragment(b).length
    ? normalizeSpeechFragment(a)
    : normalizeSpeechFragment(b)
}

function isConnectorOnlyFinal(text: string) {
  return CONNECTOR_ONLY_FINALS.has(comparisonKey(text))
}

function mergePendingFinal(
  pending: string,
  incoming: string
): { action: "replace" | "flush"; text: string } {
  const nextPending = normalizeSpeechFragment(pending)
  const nextIncoming = normalizeSpeechFragment(incoming)
  const pendingKey = comparisonKey(nextPending)
  const incomingKey = comparisonKey(nextIncoming)

  if (pendingKey === incomingKey) {
    return { action: "replace", text: pickLongerFinal(nextPending, nextIncoming) }
  }

  if (
    pendingKey &&
    incomingKey &&
    (pendingKey.startsWith(incomingKey) || incomingKey.startsWith(pendingKey))
  ) {
    return { action: "replace", text: pickLongerFinal(nextPending, nextIncoming) }
  }

  if (isConnectorOnlyFinal(nextPending)) {
    if (isConnectorOnlyFinal(nextIncoming)) {
      return { action: "replace", text: pickLongerFinal(nextPending, nextIncoming) }
    }
    return {
      action: "replace",
      text: normalizeSpeechFragment(`${nextPending} ${nextIncoming}`),
    }
  }

  return { action: "flush", text: nextIncoming }
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

type UseSpeechParams = {
  active: boolean
  send: (payload: ClientEvent) => boolean
  lastTranscript: TranscriptUpdateEvent | null
}

export function useSpeech({ active, send, lastTranscript }: UseSpeechParams) {
  const mySpeakerIdRef = useRef(MY_SPEAKER_ID)
  const pendingFinalRef = useRef<string | null>(null)
  const finalFlushTimerRef = useRef<number | null>(null)

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

  const clearPendingFinalTimer = useEffectEvent(() => {
    if (finalFlushTimerRef.current !== null) {
      window.clearTimeout(finalFlushTimerRef.current)
      finalFlushTimerRef.current = null
    }
  })

  const flushPendingFinal = useEffectEvent(() => {
    const text = pendingFinalRef.current
    clearPendingFinalTimer()
    if (!text) return

    pendingFinalRef.current = null
    console.log(`🎤 You (FINAL)    "${text}"`)
    const sent = send({
      type: "speech.final",
      text,
      speaker: mySpeakerIdRef.current,
    })
    if (!sent) {
      console.warn(
        "[MindMesh] Failed to send speech.final",
        `speaker=${mySpeakerIdRef.current}`,
        `len=${text.length}`,
        `text=${JSON.stringify(text)}`
      )
    }
  })

  const schedulePendingFinalFlush = useEffectEvent(() => {
    clearPendingFinalTimer()
    finalFlushTimerRef.current = window.setTimeout(() => {
      flushPendingFinal()
    }, FINAL_DEBOUNCE_MS)
  })

  const bufferFinal = useEffectEvent((text: string) => {
    const normalized = normalizeSpeechFragment(text)
    if (!normalized) return

    const pending = pendingFinalRef.current
    if (!pending) {
      pendingFinalRef.current = normalized
      schedulePendingFinalFlush()
      return
    }

    const merged = mergePendingFinal(pending, normalized)
    if (merged.action === "replace") {
      pendingFinalRef.current = merged.text
      schedulePendingFinalFlush()
      return
    }

    flushPendingFinal()
    pendingFinalRef.current = normalized
    schedulePendingFinalFlush()
  })

  useEffect(() => {
    if (!lastTranscript?.is_final) return
    if (!lastTranscript.speaker || lastTranscript.speaker === mySpeakerIdRef.current) return

    const label = labelFor(lastTranscript.speaker)
    console.log(`🗣️ ${label} (FINAL)  "${lastTranscript.text}"`)
  }, [lastTranscript])

  useEffect(() => {
    if (!active) return

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) {
      console.warn("[MindMesh] SpeechRecognition not supported in this browser (use Chrome/Edge)")
      return
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
          bufferFinal(text)
        } else {
          console.log(`🎤 You (partial)  "${text}"`)
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
      flushPendingFinal()
      if (!stopped) {
        restartTimer = setTimeout(() => {
          try { recognition.start() } catch { /* already started */ }
        }, 150)
      }
    }

    recognition.start()
    console.log("[MindMesh] SpeechRecognition started — speak and watch this console")
    console.log("[MindMesh] your speaker id:", mySpeakerIdRef.current)

    return () => {
      stopped = true
      if (restartTimer) clearTimeout(restartTimer)
      flushPendingFinal()
      try { recognition.abort() } catch { /* already stopped */ }
    }
  }, [active])
}
