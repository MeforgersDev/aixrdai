import { useEffect, useRef, useCallback } from "react"
import { authService } from "@/lib/auth-service"

export function useChatStream(
  chatId: string,
  onDelta: (text: string) => void,
  onComplete?: () => void
) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const bufferRef = useRef("")

  const startStream = useCallback(() => {
    const token = authService.getToken()
    if (!token) {
      console.error("No auth token available for streaming")
      return
    }

    const url = `https://api.meforgers.com/chats/${chatId}/stream`
    const controller = new AbortController()
    abortControllerRef.current = controller

    fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok || !response.body) {
          throw new Error("Stream failed to start")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder("utf-8")

        const read = () => {
          reader.read().then(({ value, done }) => {
            if (done) {
              onComplete?.()
              return
            }

            const chunk = decoder.decode(value, { stream: true })

            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  const payload = JSON.parse(line.replace("data: ", ""))
                  if (payload.type === "delta") {
                    bufferRef.current += payload.data
                    onDelta(bufferRef.current)
                  }
                } catch (err) {
                  console.error("SSE parse error:", err)
                }
              }
            }

            read()
          })
        }

        read()
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error("SSE fetch error:", err)
        onComplete?.()
      })
  }, [chatId, onDelta, onComplete])

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  useEffect(() => {
    return () => stopStream()
  }, [stopStream])

  return { startStream, stopStream }
}
