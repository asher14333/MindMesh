"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/^http/, "ws") ?? "ws://localhost:8000"

export interface RemotePeer {
  peerId: string
  userId: string
  stream: MediaStream | null
}

export interface WebRTCState {
  localStream: MediaStream | null
  remotePeers: RemotePeer[]
  isConnected: boolean
  error: string | null
}

export function useWebRTC(roomId: string, userId: string = "You"): WebRTCState {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // peer_id → RTCPeerConnection
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const myPeerIdRef = useRef<string | null>(null)

  const upsertRemotePeer = useCallback((peerId: string, userId: string, stream: MediaStream | null = null) => {
    setRemotePeers((prev) => {
      const existing = prev.find((p) => p.peerId === peerId)
      if (existing) {
        if (stream) return prev.map((p) => p.peerId === peerId ? { ...p, stream } : p)
        return prev
      }
      return [...prev, { peerId, userId, stream }]
    })
  }, [])

  const removeRemotePeer = useCallback((peerId: string) => {
    setRemotePeers((prev) => prev.filter((p) => p.peerId !== peerId))
    const pc = pcsRef.current.get(peerId)
    if (pc) { pc.close(); pcsRef.current.delete(peerId) }
  }, [])

  const relay = useCallback((to: string, data: object) => {
    wsRef.current?.send(JSON.stringify({ type: "relay", to, data }))
  }, [])

  const createPeerConnection = useCallback(
    (remotePeerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

      pc.onicecandidate = (e) => {
        if (e.candidate) relay(remotePeerId, { type: "ice-candidate", candidate: e.candidate })
      }

      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track])
        setRemotePeers((prev) =>
          prev.map((p) => p.peerId === remotePeerId ? { ...p, stream } : p)
        )
      }

      // Add local tracks
      localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!))

      pcsRef.current.set(remotePeerId, pc)
      return pc
    },
    [relay]
  )

  useEffect(() => {
    if (!roomId) return

    let cancelled = false

    async function start() {
      // 1. Get local media (camera + mic)
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch {
        // Fallback: audio-only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch {
          setError("Camera/microphone permission denied")
        }
      }
      if (cancelled) { stream?.getTracks().forEach((t) => t.stop()); return }
      if (stream) { localStreamRef.current = stream; setLocalStream(stream) }

      // 2. Connect to signaling WebSocket
      const ws = new WebSocket(`${WS_BASE}/ws/room/${roomId}?user_id=${encodeURIComponent(userId)}`)
      wsRef.current = ws

      ws.onopen = () => { if (!cancelled) setIsConnected(true) }
      ws.onclose = () => { if (!cancelled) setIsConnected(false) }
      ws.onerror = () => { if (!cancelled) setError("Signaling connection failed") }

      ws.onmessage = async (event) => {
        if (cancelled) return
        let msg: Record<string, unknown>
        try { msg = JSON.parse(event.data) } catch { return }

        const type = msg.type as string

        // Server tells us who's already in the room — send them offers
        if (type === "peers.list") {
          myPeerIdRef.current = msg.your_peer_id as string
          const peers = (msg.peers as { peer_id: string; user_id: string }[]) ?? []
          for (const p of peers) {
            upsertRemotePeer(p.peer_id, p.user_id)
            const pc = createPeerConnection(p.peer_id)
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            relay(p.peer_id, { type: "offer", sdp: offer })
          }
        }

        // A new peer joined after us — they will send us an offer
        else if (type === "peer.joined") {
          const peerId = msg.peer_id as string
          const uid = msg.user_id as string
          upsertRemotePeer(peerId, uid)
          // Don't create offer here — they will send us one first
          createPeerConnection(peerId)
        }

        else if (type === "peer.left") {
          removeRemotePeer(msg.peer_id as string)
        }

        else if (type === "relay") {
          const from = msg.from as string
          const data = msg.data as Record<string, unknown>
          const subType = data.type as string

          if (subType === "offer") {
            let pc = pcsRef.current.get(from)
            if (!pc) { pc = createPeerConnection(from) }
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            relay(from, { type: "answer", sdp: answer })
          }

          else if (subType === "answer") {
            const pc = pcsRef.current.get(from)
            if (pc && pc.signalingState !== "stable") {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit))
            }
          }

          else if (subType === "ice-candidate") {
            const pc = pcsRef.current.get(from)
            if (pc) {
              try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit)) }
              catch { /* benign — stale candidate */ }
            }
          }
        }
      }
    }

    start()

    return () => {
      cancelled = true
      wsRef.current?.close()
      wsRef.current = null
      pcsRef.current.forEach((pc) => pc.close())
      pcsRef.current.clear()
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
      setLocalStream(null)
      setRemotePeers([])
      setIsConnected(false)
    }
  }, [roomId, userId, createPeerConnection, upsertRemotePeer, removeRemotePeer, relay])

  return { localStream, remotePeers, isConnected, error }
}
