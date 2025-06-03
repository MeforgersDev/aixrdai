// use-chat-stream.ts
import { useEffect, useRef, useCallback } from "react"
import { authService } from "@/lib/auth-service"

interface DeltaPayload {
  parentId: string // USER mesajının ID'si
  content: string // Akış içeriği
}

interface FinishedPayload {
  assistantMessageId: string // Tamamlanan ASSISTANT mesajının ID'si
}

export function useChatStream(
  chatId: string,
  onDelta: (payload: DeltaPayload) => void,
  onComplete: (payload: FinishedPayload) => void, // Artık bir payload alacak
  onError: (error: Error) => void, // Hata yönetimi için
) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const bufferRef = useRef("")
  const currentParentIdRef = useRef<string | null>(null) // Delta'nın parentId'sini tutmak için

  const startStream = useCallback((parentId: string) => {
    const token = authService.getToken()
    if (!token) {
      console.error("No auth token available for streaming")
      onError(new Error("No auth token available for streaming"))
      return
    }

    // Akış başladığında buffer'ı ve parentId'yi sıfırla
    bufferRef.current = ""
    currentParentIdRef.current = parentId

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
          throw new Error(`Stream failed to start: ${response.statusText}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder("utf-8")

        const read = () => {
          reader.read().then(({ value, done }) => {
            if (done) {
              // Akış tamamen bitti, ancak 'finished' event'i gelmeyebilir
              // Eğer finished event'i gelmediyse, burası en son nokta.
              // Bu durumda onComplete'i çağırabiliriz ancak assistantMessageId'miz olmaz.
              // Bu yüzden 'finished' event'ine güvenmek daha iyi.
              return
            }

            const chunk = decoder.decode(value, { stream: true })

            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  const payload = JSON.parse(line.replace("data: ", ""))
                  if (payload.type === "delta" && payload.data.parentId === currentParentIdRef.current) {
                    bufferRef.current += payload.data.content
                    onDelta({ parentId: payload.data.parentId, content: bufferRef.current })
                  } else if (payload.type === "finished" && payload.data.assistantMessageId) {
                    onComplete({ assistantMessageId: payload.data.assistantMessageId })
                    stopStream(); // Akış tamamlandığında bağlantıyı kes
                  }
                } catch (err) {
                  console.error("SSE parse error:", err)
                  onError(err as Error)
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
        onError(err as Error)
        stopStream(); // Hata durumunda da bağlantıyı kes
      })
  }, [chatId, onDelta, onComplete, onError])

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    bufferRef.current = "" // Stop'ta buffer'ı temizle
    currentParentIdRef.current = null
  }, [])

  useEffect(() => {
    return () => stopStream() // Bileşen unmount edildiğinde akışı durdur
  }, [stopStream])

  return { startStream, stopStream, buffer: bufferRef.current }
}