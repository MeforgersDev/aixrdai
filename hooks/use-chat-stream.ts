// hooks/use-chat-stream.ts
import { useEffect, useRef, useCallback } from "react"
import { authService } from "@/lib/auth-service"

export function useChatStream(
  chatId: string,
  onDelta: (text: string) => void,
  onComplete: (fullMessage: string) => void // Değişiklik burada: tam mesajı da dönecek
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
    bufferRef.current = "" // Her yeni akış başladığında buffer'ı temizle

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
              onComplete(bufferRef.current) // Yayın bittiğinde tam mesajı callback'e gönder
              return
            }

            const chunk = decoder.decode(value, { stream: true })

            // SSE formatındaki "data: " önekini ve boşlukları kaldır
            const lines = chunk.split('\n').filter(line => line.startsWith('data: ')).map(line => line.substring(6));

            for (const line of lines) {
              try {
                const payload = JSON.parse(line);
                if (payload.type === "delta") {
                  bufferRef.current += payload.data;
                  onDelta(bufferRef.current);
                } else if (payload.type === "complete") { // Backend'den tamamlama sinyali alabiliriz
                    // Bu senaryoda `onComplete` zaten `done` ile çağrılacak.
                    // Ek bir işlem yapmaya gerek olmayabilir, ancak backend tarafından özel bir 'complete' event'i gönderiliyorsa burada yakalanabilir.
                }
              } catch (err) {
                console.error("SSE parse error:", err, "Line:", line);
              }
            }

            read()
          })
          .catch(err => {
            if (controller.signal.aborted) return;
            console.error("SSE read error:", err);
            onComplete(bufferRef.current); // Hata durumunda da onComplete'i çağır
          });
        }

        read()
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error("SSE fetch error:", err)
        onComplete(bufferRef.current) // Fetch hatasında da onComplete'i çağır
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