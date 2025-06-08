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
  onComplete: (data: StreamCompletionData) => void // Değiştirildi: tek bir obje alacak
) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const bufferRef = useRef("") // Akış sırasında biriken tüm metni tutar
  const parentIdRef = useRef<string | undefined>(undefined); // Akış mesajının parentId'sini tutar (ilk delta'dan alınacak)
  const assistantMessageIdRef = useRef<string | undefined>(undefined); // Bitirme olayından alınacak

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
    assistantMessageIdRef.current = undefined; // Sıfırla

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
        let chunkBuffer = "" // Gelen chunk'ları birleştirip tam olayları ayrıştırmak için

        const processBuffer = () => {
          // SSE standartlarına göre, her olayın sonunda iki yeni sat (\n\n) bulunur.
          // Ancak, chunk'lar olayların tam ortasından bölünebilir.
          // Bu yüzden 'data: ' veya 'event: ' gibi prefix'lerle başlayan satırları
          // doğru bir şekilde ayrıştırmak için daha dikkatli olmalıyız.
          const lines = chunkBuffer.split('\n');
          let currentEvent = "";
          let processedLength = 0; // İşlenen karakter sayısını takip et

          for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.trim() === "") { // Boş satır, bir olayın sonu anlamına gelir
                  if (currentEvent.length > 0) {
                      // Tamamlanmış bir olay var, şimdi onu parse et
                      try {
                          let eventType: string | null = null;
                          let eventData = '';
                          // event ve data satırlarını parse et
                          currentEvent.split('\n').forEach(eventLine => {
                              if (eventLine.startsWith('event: ')) {
                                  eventType = eventLine.substring('event: '.length).trim();
                              } else if (eventLine.startsWith('data: ')) {
                                  eventData += eventLine.substring('data: '.length).trim();
                              }
                          });

                          if (eventType && eventData) {
                            const payload = JSON.parse(eventData);
                                
                              // Backend'den gelen yeni payload yapısına göre düzeltme
                              if (eventType === "delta" && payload.chatId === chatId) {
                                  bufferRef.current += payload.delta; // DOĞRU: payload.delta'yı kullan
                                  if (payload.parentId && !parentIdRef.current) {
                                      parentIdRef.current = payload.parentId;
                                  }
                                  onDelta(bufferRef.current, parentIdRef.current);
                              } else if (eventType === "finished" && payload.chatId === chatId) {
                                  // Bu kısım zaten doğru, çünkü assistantMessageId'yi bekliyordu.
                                  // Artık backend'den bu veri geleceği için düzgün çalışacak.
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
                          } // Bu 'if (eventType && eventData)' bloğunu kapattık.
                      } catch (err) {
                          console.error("SSE event parse error:", err, "Event:", currentEvent);
                      }
                      currentEvent = ""; // Olay işlendi, sıfırla
                  }
                  processedLength += line.length + 1; // Yeni satır karakterini de say
              } else {
                  currentEvent += line + '\n';
                  processedLength += line.length + 1;
              }
          }
          // İşlenmemiş kısmı tekrar buffer'a at
          chunkBuffer = chunkBuffer.substring(processedLength);
        };

        const read = () => {
          reader.read().then(({ value, done }) => {
            if (controller.signal.aborted) {
                // Eğer akış durdurulmuşsa, kalan işleme devam etme
                return; 
            }

            if (value) {
                chunkBuffer += decoder.decode(value, { stream: true });
            }
            
            processBuffer();

            if (done) {
              // Akış tamamen bittiğinde ve 'finished' olayı gelmediyse (hata veya sunucu kapanması durumunda)
              // onComplete'i çağır. (Normalde finished event'i geldikten sonra stopStream() çağrılır ve buraya düşülmez)
              if (!controller.signal.aborted && bufferRef.current.length > 0) {
                 onComplete({
                    chatId: chatId,
                    finalContent: bufferRef.current,
                    parentId: parentIdRef.current,
                    assistantMessageId: assistantMessageIdRef.current, // Eğer belirlenmişse
                });
              }
              stopStream(); // Stream tamamen kapandı
              return;
            }

            read(); // Bir sonraki chunku oku
          }).catch((err) => {
            if (controller.signal.aborted) return; // Manuel durdurulduysa hata loglama
            console.error("Reader read error:", err);
            // Hata durumunda da akışı tamamla
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
      .catch((err) => { // Bu catch bloğu doğru yerleştirilmişti, sadece .then() sonrası olması yeterliydi.
        if (controller.signal.aborted) return;
        console.error("SSE fetch error:", err);
        // Fetch hatası durumunda da akışı tamamla
        onComplete({
            chatId: chatId,
            finalContent: bufferRef.current,
            parentId: parentIdRef.current,
            assistantMessageId: assistantMessageIdRef.current,
        });
        stopStream();
      });
  }, [chatId, onDelta, onComplete, stopStream]); // stopStream'i bağımlılıklara ekle

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return { startStream, stopStream };
}