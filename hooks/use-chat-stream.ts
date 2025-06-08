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
  const bufferRef = useRef("") 
  const parentIdRef = useRef<string | undefined>(undefined); 
  const assistantMessageIdRef = useRef<string | undefined>(undefined); 

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    bufferRef.current = "";
    parentIdRef.current = undefined;
    assistantMessageIdRef.current = undefined;
  }, []);

  const startStream = useCallback(() => {
    const token = authService.getToken()
    if (!token) {
      console.error("No auth token available for streaming")
      return
    }

    // Her yeni akış başladığında buffer ve parentId'yi sıfırla
    bufferRef.current = "";
    parentIdRef.current = undefined;
    assistantMessageIdRef.current = undefined; 

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
                                
                              if (eventType === "delta" && payload.chatId === chatId) {
                                  bufferRef.current += payload.delta; 
                                  if (payload.parentId && !parentIdRef.current) {
                                      parentIdRef.current = payload.parentId;
                                  }
                                  onDelta(bufferRef.current, parentIdRef.current);
                              } else if (eventType === "finished" && payload.chatId === chatId) {
                                  assistantMessageIdRef.current = payload.assistantMessageId;
                                  console.log('Received finished event with assistantMessageId:', payload.assistantMessageId); 
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
                          console.error("SSE event parse error:", err, "Event:", currentEvent);
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
                return; 
            }

            if (value) {
                chunkBuffer += decoder.decode(value, { stream: true });
            }
            
            processBuffer();

            if (done) {
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
            if (controller.signal.aborted) return; 
            console.error("Reader read error:", err);
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
        if (controller.signal.aborted) return;
        console.error("SSE fetch error:", err);
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