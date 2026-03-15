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

function summarizeClientEvent(payload: ClientEvent): string {
  switch (payload.type) {
    case "session.start":
      return `session.start meeting_title=${payload.meeting_title ?? "-"}`
    case "session.stop":
      return "session.stop"
    case "speech.partial":
    case "speech.final":
      return `${payload.type} speaker=${payload.speaker ?? "-"} len=${payload.text.length} text=${JSON.stringify(payload.text)}`
    case "ui.command":
      return `ui.command command=${payload.command} payload=${JSON.stringify(payload.payload ?? {})}`
    case "canvas.edit":
      return `canvas.edit ops=${payload.ops.length}`
    case "collab.cursor":
      return `collab.cursor user=${payload.user_id}`
    case "collab.selection":
      return `collab.selection user=${payload.user_id} node=${payload.node_id}`
    case "transcription.toggle":
      return `transcription.toggle enabled=${payload.enabled} user=${payload.user_name}`
  }
}

function summarizeServerEvent(event: ServerEvent): string {
  if (!event || typeof event !== "object" || !("type" in event)) return "unknown"
  switch (event.type) {
    case "status":
      return `status mode=${event.mode} message=${event.message} diagram_type=${event.diagram_type ?? "null"}`
    case "transcript.update":
      return `transcript.update final=${event.is_final} speaker=${event.speaker ?? "-"} len=${event.text.length}`
    case "intent.result":
      return `intent.result diagram_type=${event.result.diagram_type} action=${event.result.action} confidence=${event.result.confidence.toFixed(2)}`
    case "diagram.replace":
      return `diagram.replace version=${event.diagram.version} nodes=${event.diagram.nodes.length} edges=${event.diagram.edges.length}`
    case "diagram.patch":
      return `diagram.patch base=${event.patch.base_version} version=${event.patch.version} ops=${event.patch.ops.length}`
    case "error":
      return `error message=${event.message}`
    case "collab.cursor":
      return `collab.cursor user=${event.user_id}`
    case "collab.selection":
      return `collab.selection user=${event.user_id} node=${event.node_id}`
    case "collab.edit":
      return `collab.edit ops=${event.ops.length}`
    case "transcription.toggle":
      return `transcription.toggle enabled=${event.enabled} user=${event.user_name}`
    case "session.info":
      return `session.info started_at=${event.started_at}`
    default:
      return `unknown event type`
  }
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
    if (!ws) {
      console.warn("[mindmesh] send dropped: no websocket", summarizeClientEvent(payload))
      return false
    }
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(
        "[mindmesh] send dropped: socket not open",
        `readyState=${ws.readyState}`,
        summarizeClientEvent(payload)
      )
      return false
    }

    console.log("[mindmesh] ws.send", summarizeClientEvent(payload))
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
      console.log(
        "[mindmesh] ws.connect",
        `session=${sessionId}`,
        `reconnect=${isReconnect}`,
        `url=${url}`
      )
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        backoffMsRef.current = 250
        setConnectionState("open")
        console.log("[mindmesh] ws.open", `session=${sessionId}`, `url=${url}`)
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

        console.log("[mindmesh] ws.recv", summarizeServerEvent(event))
        onServerEventRef.current(event)
      }

      ws.onerror = () => {
        // Most errors will be followed by onclose; keep this lightweight.
        console.warn("[mindmesh] ws.error", `session=${sessionId}`, `url=${url}`)
        setConnectionState("error")
      }

      ws.onclose = (event) => {
        console.warn(
          "[mindmesh] ws.close",
          `session=${sessionId}`,
          `code=${event.code}`,
          `reason=${event.reason || "-"}`,
          `wasClean=${event.wasClean}`
        )
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
