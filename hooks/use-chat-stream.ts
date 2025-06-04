// hooks/use-chat-stream.ts
import { useEffect, useRef, useCallback } from "react"
import { authService } from "@/lib/auth-service"

export function useChatStream(
  chatId: string,
  onDelta: (text: string) => void,
  onComplete: () => void // onComplete'i zorunlu hale getirdim veya en azından her zaman çağırın
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
              onComplete?.() // Akış bittiğinde onComplete'i çağır
              return
            }

            const chunk = decoder.decode(value, { stream: true })

            // Birden fazla olayın aynı anda gelmesi durumunda satır satır işleyin
            // 'event: type\ndata: {}\n\n' formatını bekliyoruz
            const lines = chunk.split('\n');
            let eventType = null;
            let eventData = '';

            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    eventType = line.replace('event: ', '').trim();
                } else if (line.startsWith('data: ')) {
                    eventData += line.replace('data: ', '').trim();
                } else if (line === '' && eventType && eventData) { // Boş satır bir olayın sonunu belirtir
                    try {
                        const payload = JSON.parse(eventData);
                        if (eventType === "delta" && payload.chatId === chatId) {
                            bufferRef.current += payload.data;
                            onDelta(bufferRef.current);
                        } else if (eventType === "finished" && payload.chatId === chatId) {
                            // Akış bittiğinde yapılacak bir işlem varsa burada yapın,
                            // ancak onComplete zaten genel bir bitiş işlemi için çağrılacak.
                            // Örneğin, bir yükleme durumunu kapatmak gibi.
                        }
                    } catch (err) {
                        console.error("SSE parse error:", err, "Line:", line, "EventType:", eventType, "EventData:", eventData);
                    }
                    // Reset for the next event
                    eventType = null;
                    eventData = '';
                }
            }
            read()
          }).catch((err) => {
            if (controller.signal.aborted) return;
            console.error("Reader read error:", err);
            onComplete?.(); // Hata durumunda da onComplete'i çağır
          });
        };

        read();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("SSE fetch error:", err);
        onComplete?.(); // Hata durumunda da onComplete'i çağır
      });
  }, [chatId, onDelta, onComplete]); // onComplete'i bağımlılık olarak ekleyin

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    bufferRef.current = ""; // Akış durduğunda arabelleği temizle
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  return { startStream, stopStream };
}