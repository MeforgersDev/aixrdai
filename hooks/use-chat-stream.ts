// hooks/use-chat-stream.ts
import { useEffect, useRef, useCallback } from "react"
import { authService } from "@/lib/auth-service"

export function useChatStream(
  chatId: string,
  onDelta: (text: string, parentId?: string) => void, // parentId'yi de ekledik
  onComplete: () => void
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
          throw new Error("Stream failed to start or response body is null")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder("utf-8")
        let buffer = "" // Chunk'lar arasında kalan veriyi tutmak için

        const processBuffer = () => {
          const events = buffer.split('\n\n'); // Olayları çift yeni satır ile ayır
          buffer = events.pop() || ""; // Son olayı (tamamlanmamış olabilir) veya boş bırak

          for (const eventString of events) {
            if (!eventString.trim()) continue; // Boş olayları atla

            let eventType = null;
            let eventData = '';
            let eventId = null;

            const lines = eventString.split('\n');
            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    eventType = line.replace('event: ', '').trim();
                } else if (line.startsWith('data: ')) {
                    // data: sonrası JSON'ı birleştirin, birden fazla data satırı olabilir
                    eventData += line.replace('data: ', '').trim();
                } else if (line.startsWith('id: ')) { // Eğer backend'den id geliyorsa
                    eventId = line.replace('id: ', '').trim();
                }
            }

            if (eventType && eventData) {
                try {
                    const payload = JSON.parse(eventData);
                    if (eventType === "delta" && payload.chatId === chatId) {
                        bufferRef.current += payload.data;
                        onDelta(bufferRef.current, payload.parentId); // parentId'yi de gönder
                    } else if (eventType === "finished" && payload.chatId === chatId) {
                        onComplete(); // Akış bittiğinde onComplete'i çağır
                        stopStream(); // Akışı burada durdurmak daha mantıklı
                        return; // Bitirme olayı geldiyse daha fazla işlem yapma
                    }
                } catch (err) {
                    console.error("SSE parse error:", err, "Event String:", eventString);
                }
            }
          }
        };

        const read = () => {
          reader.read().then(({ value, done }) => {
            if (done) {
              processBuffer(); // Kalan buffer'ı işle
              onComplete(); // Akış tamamen bittiğinde onComplete'i çağır
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            processBuffer();
            read();
          }).catch((err) => {
            if (controller.signal.aborted) return;
            console.error("Reader read error:", err);
            onComplete(); // Hata durumunda da onComplete'i çağır
          });
        };

        read();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("SSE fetch error:", err);
        onComplete(); // Hata durumunda da onComplete'i çağır
      });
  }, [chatId, onDelta, onComplete]);

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    bufferRef.current = "";
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  return { startStream, stopStream };
}