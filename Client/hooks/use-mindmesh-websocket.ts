"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ClientEvent, ServerEvent } from "@/lib/mindmesh/events"
import { buildMindMeshWsUrl, parseServerEvent } from "@/lib/mindmesh/events"

export type ConnectionState =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "open"
  | "closed"
  | "error"

type Params = {
  sessionId: string
  enabled: boolean
  onServerEvent: (event: ServerEvent) => void
  onOpen?: (send: (payload: ClientEvent) => boolean) => void
}

export function useMindMeshWebSocket({
  sessionId,
  enabled,
  onServerEvent,
  onOpen,
}: Params) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(false)
  const backoffMsRef = useRef(250)

  const onServerEventRef = useRef(onServerEvent)
  const onOpenRef = useRef(onOpen)

  useEffect(() => {
    onServerEventRef.current = onServerEvent
  }, [onServerEvent])

  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])

  const send = useCallback((payload: ClientEvent) => {
    const ws = wsRef.current
    if (!ws) return false
    if (ws.readyState !== WebSocket.OPEN) return false

    ws.send(JSON.stringify(payload))
    return true
  }, [])

  useEffect(() => {
    if (!enabled) {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      wsRef.current?.close(1000, "MindMesh disabled")
      wsRef.current = null
      setConnectionState("idle")
      return
    }

    shouldReconnectRef.current = true

    const connect = (isReconnect: boolean) => {
      if (!shouldReconnectRef.current) return

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      setConnectionState(isReconnect ? "reconnecting" : "connecting")

      const url = buildMindMeshWsUrl(sessionId)
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        backoffMsRef.current = 250
        setConnectionState("open")
        onOpenRef.current?.(send)
      }

      ws.onmessage = (message) => {
        if (typeof message.data !== "string") return

        let raw: unknown
        try {
          raw = JSON.parse(message.data)
        } catch {
          console.warn("[mindmesh] Failed to parse WS JSON:", message.data)
          return
        }

        const event = parseServerEvent(raw)
        if (!event) {
          console.warn("[mindmesh] Ignoring unsupported/invalid server event:", raw)
          return
        }

        onServerEventRef.current(event)
      }

      ws.onerror = () => {
        // Most errors will be followed by onclose; keep this lightweight.
        setConnectionState("error")
      }

      ws.onclose = () => {
        wsRef.current = null
        if (!shouldReconnectRef.current) {
          setConnectionState("closed")
          return
        }

        setConnectionState("reconnecting")
        const jitter = Math.floor(Math.random() * 200)
        const delay = backoffMsRef.current + jitter
        backoffMsRef.current = Math.min(backoffMsRef.current * 2, 5000)

        reconnectTimerRef.current = window.setTimeout(() => connect(true), delay)
      }
    }

    connect(false)

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      wsRef.current?.close(1000, "MindMesh unmounted")
      wsRef.current = null
    }
  }, [enabled, sessionId, send])

  return { connectionState, send }
}

