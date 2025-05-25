"use client"

import { useEffect, useRef, useCallback } from "react"
import { authService } from "@/lib/auth-service"

export function useChatStream(chatId: string, onDelta: (text: string) => void, onComplete?: () => void) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const bufferRef = useRef("")

  const startStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    bufferRef.current = ""
    const token = authService.getToken()

    if (!token) {
      console.error("No auth token available for streaming")
      return
    }

    // Note: EventSource doesn't support custom headers directly
    // We'll need to pass the token as a query parameter or use a different approach
    const url = `https://api.meforgers.com/chats/${chatId}/stream?token=${encodeURIComponent(token)}`

    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === "delta") {
          bufferRef.current += data.data
          onDelta(bufferRef.current)
        }
      } catch (error) {
        console.error("Error parsing SSE data:", error)
      }
    }

    eventSource.onerror = (error) => {
      console.error("SSE error:", error)
      eventSource.close()
      onComplete?.()
    }

    eventSource.addEventListener("close", () => {
      eventSource.close()
      onComplete?.()
    })
  }, [chatId, onDelta, onComplete])

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopStream()
    }
  }, [stopStream])

  return { startStream, stopStream }
}
