// hooks/use-chat-stream.ts
import { useEffect, useRef, useCallback } from "react"
import { authService } from "@/lib/auth-service"

// onComplete callback'ine geçecek veri tipi
interface StreamCompletionData {
  chatId: string;
  finalContent: string;
  parentId?: string;
  assistantMessageId?: string; // Backend'den gelen gerçek assistantMessageId
}

export function useChatStream(
  chatId: string,
  onDelta: (text: string, parentId?: string) => void,
  onComplete: (data: StreamCompletionData) => void
) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const bufferRef = useRef("") // Akış sırasında biriken tüm metni tutar
  const parentIdRef = useRef<string | undefined>(undefined); // Akış mesajının parentId'sini tutar (ilk delta'dan alınacak)
  const assistantMessageIdRef = useRef<string | undefined>(undefined); // Bitirme olayından alınacak

  const stopStream = useCallback(() => {
    console.log(`[FRONTEND STREAM] Stopping stream for chat ${chatId}.`);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    bufferRef.current = "";
    parentIdRef.current = undefined;
    assistantMessageIdRef.current = undefined;
  }, [chatId]); // chatId bağımlılığını ekle

  const startStream = useCallback(() => {
    const token = authService.getToken()
    if (!token) {
      console.error("[FRONTEND STREAM ERROR] No auth token available for streaming.")
      return
    }

    // Her yeni akış başladığında buffer ve parentId'yi sıfırla
    bufferRef.current = "";
    parentIdRef.current = undefined;
    assistantMessageIdRef.current = undefined;

    const url = `https://api.meforgers.com/chats/${chatId}/stream`
    const controller = new AbortController()
    abortControllerRef.current = controller

    console.log(`[FRONTEND STREAM] Attempting to start stream: ${url}`);

    fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    })
      .then((response) => {
        console.log(`[FRONTEND STREAM] Fetch response received. Status: ${response.status} ${response.statusText}`);
        if (!response.ok || !response.body) {
          throw new Error(`Stream failed to start: ${response.statusText}`);
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder("utf-8")
        let chunkBuffer = ""

        const processBuffer = () => {
          const lines = chunkBuffer.split('\n');
          let currentEvent = "";
          let processedLength = 0;

          for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.trim() === "") {
                  if (currentEvent.length > 0) {
                      try {
                          let eventType: string | null = null;
                          let eventData = '';
                          currentEvent.split('\n').forEach(eventLine => {
                              if (eventLine.startsWith('event: ')) {
                                  eventType = eventLine.substring('event: '.length).trim();
                              } else if (eventLine.startsWith('data: ')) {
                                  eventData += eventLine.substring('data: '.length).trim();
                              }
                          });

                          if (eventType && eventData) {
                            const payload = JSON.parse(eventData);
                            console.log(`[FRONTEND STREAM] Processed event type: ${eventType}, payload:`, payload);
                                
                              if (eventType === "delta" && payload.chatId === chatId) {
                                  bufferRef.current += payload.delta;
                                  if (payload.parentId && !parentIdRef.current) {
                                      parentIdRef.current = payload.parentId;
                                  }
                                  onDelta(bufferRef.current, parentIdRef.current);
                              } else if (eventType === "finished" && payload.chatId === chatId) {
                                  assistantMessageIdRef.current = payload.assistantMessageId;
                                  console.log('[FRONTEND STREAM] Received finished event with assistantMessageId:', payload.assistantMessageId); 
                                  onComplete({
                                      chatId: payload.chatId,
                                      finalContent: bufferRef.current,
                                      parentId: parentIdRef.current,
                                      assistantMessageId: assistantMessageIdRef.current,
                                  });
                                  stopStream();
                                  return;
                              }
                          }
                      } catch (err) {
                          console.error("[FRONTEND STREAM ERROR] SSE event parse error:", err, "Event:", currentEvent);
                      }
                      currentEvent = "";
                  }
                  processedLength += line.length + 1;
              } else {
                  currentEvent += line + '\n';
                  processedLength += line.length + 1;
              }
          }
          chunkBuffer = chunkBuffer.substring(processedLength);
        };

        const read = () => {
          reader.read().then(({ value, done }) => {
            if (controller.signal.aborted) {
                console.log("[FRONTEND STREAM] Read aborted due to controller signal.");
                return; 
            }

            if (value) {
                chunkBuffer += decoder.decode(value, { stream: true });
                console.log(`[FRONTEND STREAM] Received chunk. Current buffer size: ${chunkBuffer.length}`);
            }
            
            processBuffer();

            if (done) {
              console.log("[FRONTEND STREAM] Stream reading completed (done signal).");
              if (!controller.signal.aborted && bufferRef.current.length > 0) {
                 onComplete({
                    chatId: chatId,
                    finalContent: bufferRef.current,
                    parentId: parentIdRef.current,
                    assistantMessageId: assistantMessageIdRef.current,
                });
              }
              stopStream();
              return;
            }

            read();
          }).catch((err) => {
            if (controller.signal.aborted) {
                console.log("[FRONTEND STREAM] Reader read error: Aborted.");
                return;
            }
            console.error("[FRONTEND STREAM ERROR] Reader read error caught:", err);
            onComplete({
                chatId: chatId,
                finalContent: bufferRef.current,
                parentId: parentIdRef.current,
                assistantMessageId: assistantMessageIdRef.current,
            });
            stopStream();
          });
        };

        read();
      })
      .catch((err) => {
        if (controller.signal.aborted) {
            console.log("[FRONTEND STREAM] Fetch operation aborted.");
            return;
        }
        console.error("[FRONTEND STREAM ERROR] SSE fetch initiation error:", err);
        onComplete({
            chatId: chatId,
            finalContent: bufferRef.current,
            parentId: parentIdRef.current,
            assistantMessageId: assistantMessageIdRef.current,
        });
        stopStream();
      });
  }, [chatId, onDelta, onComplete, stopStream]);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return { startStream, stopStream };
}