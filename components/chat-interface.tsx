// chat-interface.tsx
"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send } from "lucide-react"
import { chatService } from "@/lib/chat-service"
import { useChatStream } from "@/hooks/use-chat-stream" // Güncellenmiş hook
import type { Message } from "@/types/chat"
import { MessageBubble } from "@/components/message-bubble"
import { toast } from "@/hooks/use-toast"
import { nanoid } from "nanoid" // Benzersiz ID'ler için
import { Loader2 } from "lucide-react" // Yükleme animasyonu için

interface ChatInterfaceProps {
  chatId: string
  onChatUpdate?: () => void
}

export function ChatInterface({ chatId, onChatUpdate }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false) // Sadece mesaj gönderme işlemini kapsar
  const [isStreaming, setIsStreaming] = useState(false) // Sadece AI yanıt akışını kapsar
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null) // Akış sırasındaki AI mesajının ID'si

  const { startStream, stopStream } = useChatStream(
    chatId,
    (payload) => {
      // Akış başlar başlamaz geçici bir AI mesajı ekle veya güncelle
      if (!currentAssistantMessageId) {
        // İlk delta geldiğinde yeni bir geçici AI mesajı oluştur
        const newTempId = nanoid();
        setCurrentAssistantMessageId(newTempId);
        setMessages((prev) => [
          ...prev,
          {
            id: newTempId,
            chatId,
            role: "ASSISTANT",
            content: payload.content, // İlk delta'nın içeriği
            createdAt: new Date().toISOString(),
            parentId: payload.parentId, // USER mesajının ID'si
          },
        ]);
      } else {
        // Zaten bir akış mesajı varsa içeriğini güncelle
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentAssistantMessageId
              ? { ...msg, content: payload.content }
              : msg,
          ),
        );
      }
    },
    async (payload) => {
      // Akış tamamlandı, gerçek mesajı veritabanından alıp geçici mesajı güncelle
      setIsStreaming(false);
      setCurrentAssistantMessageId(null); // Akış bitti, geçici ID'yi temizle

      try {
        // API'den mesajları yeniden yükle (tüm sohbet geçmişi güncellenmiş olacak)
        // Bu, veritabanına kaydedilen son mesajı almamızı sağlar.
        await loadMessages();
        onChatUpdate?.(); // Sohbet listesini güncelle
      } catch (error) {
        console.error("Mesajlar güncellenirken hata:", error);
        toast({
          title: "Hata",
          description: "AI yanıtı alınırken bir hata oluştu",
          variant: "destructive",
        });
      }
    },
    (error) => {
      console.error("Akış hatası:", error);
      toast({
        title: "Hata",
        description: "AI yanıtı alınırken bir hata oluştu: " + error.message,
        variant: "destructive",
      });
      setIsStreaming(false);
      setCurrentAssistantMessageId(null);
    }
  );

  useEffect(() => {
    loadMessages();
    // Sohbet değiştiğinde varsa devam eden akışı durdur
    return () => {
      stopStream();
      setCurrentAssistantMessageId(null);
      setIsStreaming(false);
      setIsSendingMessage(false);
    };
  }, [chatId]); // chatId değiştiğinde mesajları yeniden yükle

  useEffect(() => {
    scrollToBottom();
  }, [messages]); // messages state'i her değiştiğinde aşağı kaydır

  const loadMessages = async () => {
    setIsSendingMessage(true); // Yükleme sırasında input'u devre dışı bırak
    try {
      const messageList = await chatService.getMessages(chatId);
      setMessages(messageList);
    } catch (error) {
      console.error("Mesajlar yüklenirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesajlar yüklenirken bir hata oluştu",
        variant: "destructive",
      });
    } finally {
      setIsSendingMessage(false); // Yükleme bitti
    }
  };

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSendingMessage || isStreaming) return

    const messageContent = inputValue.trim()
    setInputValue("")
    setIsSendingMessage(true) // Mesaj gönderme işlemi başladı

    try {
      // Optimistic UI update for USER message
      const tempUserMessage: Message = {
        id: nanoid(), // Geçici ID
        chatId,
        role: "USER",
        content: messageContent,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMessage]);

      // USER mesajı backend'e gönderilirken, AI akışı hemen başlatılabilir.
      // USER mesajının ID'sini (parentId) almamız gerekecek.
      // Bu, backend'den gelen `chat.delta` olayının `parentId` alanına bağlı.
      const response = await chatService.sendMessage(chatId, messageContent);
      const userMessageId = response.userMsg.id; // Backend'den gelen USER mesajının ID'si

      setIsStreaming(true); // Akış başladı
      startStream(userMessageId); // Stream'i başlat ve USER mesajının ID'sini geç

    } catch (error) {
      console.error("Mesaj gönderilirken hata:", error)
      toast({
        title: "Hata",
        description: "Mesaj gönderilirken bir hata oluştu",
        variant: "destructive",
      })
      // Hata durumunda geçici USER mesajını kaldırabiliriz
      setMessages((prev) => prev.filter(msg => msg.id.startsWith("temp-") === false));
      setIsStreaming(false);
      setCurrentAssistantMessageId(null);
    } finally {
      setIsSendingMessage(false); // Mesaj gönderme işlemi bitti
    }
  }

  const handleRegenerateMessage = async (parentId: string, content: string) => {
    if (isSendingMessage || isStreaming) return;

    // Önceki akışı durdur
    stopStream();
    setCurrentAssistantMessageId(null);

    setIsSendingMessage(true); // Yeniden üretme işlemi başladı
    setIsStreaming(true); // Akış başladı

    try {
      // Optimistik olarak eski AI yanıtını kaldır veya değiştir
      setMessages((prev) => prev.filter(msg => msg.parentId !== parentId || msg.role === "USER"));

      // Tekrar gönderme işlemi için aynı parentId'yi kullan
      const response = await chatService.sendMessage(chatId, content, parentId);
      const userMessageId = response.userMsg.id; // Backend'den gelen USER mesajının ID'si

      startStream(userMessageId); // Stream'i başlat ve USER mesajının ID'sini geç
      onChatUpdate?.(); // Sohbet listesini güncelle
    } catch (error) {
      console.error("Mesaj yeniden üretilirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesaj yeniden üretilirken bir hata oluştu",
        variant: "destructive",
      });
      setIsStreaming(false);
      setCurrentAssistantMessageId(null);
    } finally {
      setIsSendingMessage(false); // Yeniden üretme işlemi bitti
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const combinedLoading = isSendingMessage || isStreaming;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-1">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRegenerate={handleRegenerateMessage}
              // Akış sırasında olan AI mesajını belirlemek için isStreaming'i props olarak geçin
              isStreaming={isStreaming && message.id === currentAssistantMessageId}
            />
          ))}

          {/* Sadece isStreaming true iken ve currentAssistantMessageId set edilmemişse veya farklı bir akış varsa boş bir loader göster */}
          {combinedLoading && !currentAssistantMessageId && messages.length > 0 && (
            <div className="flex justify-start items-center p-2 rounded-lg max-w-[80%] my-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
              <span className="text-gray-600 italic">Yapay zeka yanıt oluşturuyor...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Mesajınızı yazın..."
                className="min-h-[60px] max-h-[200px] resize-none pr-12"
                disabled={combinedLoading} // Hem gönderim hem akış sırasında devre dışı
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || combinedLoading}
                size="sm"
                className="absolute right-2 bottom-2"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
            <span>Enter ile gönder, Shift+Enter ile yeni satır</span>
            <span>{inputValue.length}/4096</span>
          </div>
        </div>
      </div>
    </div>
  )
}