"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useWebRTC, type WebRTCState } from "@/hooks/use-webrtc"

const WebRTCContext = createContext<WebRTCState>({
  localStream: null,
  remotePeers: [],
  isConnected: false,
  error: null,
})

export function WebRTCProvider({
  children,
  roomId,
  userId = "You",
}: {
  children: ReactNode
  roomId: string
  userId?: string
}) {
  const state = useWebRTC(roomId, userId)
  return <WebRTCContext.Provider value={state}>{children}</WebRTCContext.Provider>
}

export function useWebRTCContext(): WebRTCState {
  return useContext(WebRTCContext)
}
