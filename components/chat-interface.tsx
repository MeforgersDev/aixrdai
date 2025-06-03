// chat-interface.tsx
"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send } from "lucide-react"
import { chatService } from "@/lib/chat-service"
import { useChatStream } from "@/hooks/use-chat-stream"
import { MessageBubble } from "@/components/message-bubble"
import type { Message } from "@/types/chat"
import { toast } from "@/hooks/use-toast"
import { nanoid } from "nanoid"
import { Loader2 } from "lucide-react"

interface ChatInterfaceProps {
  chatId: string
  onChatUpdate?: () => void
}

export function ChatInterface({ chatId, onChatUpdate }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null)

  // Mesajları ID'ye göre hızlıca erişmek için bir Map kullanın
  const messagesByIdRef = useRef<Map<string, Message>>(new Map());

  // messages state'i değiştiğinde Map'i güncelleyin
  useEffect(() => {
    messagesByIdRef.current.clear();
    messages.forEach(msg => messagesByIdRef.current.set(msg.id, msg));
  }, [messages]);

  const { startStream, stopStream } = useChatStream(
    chatId,
    (payload) => {
      // Akış başlar başlamaz geçici bir AI mesajı ekle veya güncelle
      setMessages((prev) => {
        const existingStreamMessageIndex = prev.findIndex(msg => msg.id === currentAssistantMessageId);

        if (existingStreamMessageIndex === -1) {
          // İlk delta geldiğinde veya yeni bir akış başladığında yeni bir geçici AI mesajı oluştur
          const newTempId = `temp-${nanoid()}`; // Geçici ID'lerin ön eki olsun
          setCurrentAssistantMessageId(newTempId);
          return [
            ...prev,
            {
              id: newTempId,
              chatId,
              role: "ASSISTANT",
              content: payload.content,
              createdAt: new Date().toISOString(),
              parentId: payload.parentId,
            },
          ];
        } else {
          // Zaten bir akış mesajı varsa içeriğini güncelle
          const updatedMessages = [...prev];
          updatedMessages[existingStreamMessageIndex] = {
            ...updatedMessages[existingStreamMessageIndex],
            content: payload.content,
          };
          return updatedMessages;
        }
      });
    },
    async (payload) => {
      // Akış tamamlandı, gerçek mesajı veritabanından alıp geçici mesajı güncelle
      setIsStreaming(false);
      setCurrentAssistantMessageId(null); // Akış bitti, geçici ID'yi temizle

      try {
        await loadMessages(); // API'den mesajları yeniden yükle (tüm sohbet geçmişi güncellenmiş olacak)
        onChatUpdate?.(); // Sohbet listesini güncelle (başlık güncellenmiş olabilir)
      } catch (error) {
        console.error("Mesajlar güncellenirken hata:", error);
        toast({
          title: "Hata",
          description: "AI yanıtı alınırken bir hata oluştu (mesajlar yüklenemedi).",
          variant: "destructive",
        });
      }
    },
    (error) => {
      console.error("Akış hatası:", error);
      toast({
        title: "Akış Hatası",
        description: "AI yanıtı alınırken bir hata oluştu: " + error.message,
        variant: "destructive",
      });
      setIsStreaming(false);
      setCurrentAssistantMessageId(null);
      // Hata durumunda geçici AI mesajını kaldır
      setMessages((prev) => prev.filter(msg => msg.id.startsWith("temp-") === false));
    }
  );

  useEffect(() => {
    loadMessages();
    return () => {
      stopStream();
      setCurrentAssistantMessageId(null);
      setIsStreaming(false);
      setIsSendingMessage(false);
    };
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentAssistantMessageId]); // messages veya akış güncellendiğinde aşağı kaydır

  const loadMessages = async () => {
    // Yükleme sırasında input'u devre dışı bırakmak için isSendingMessage'i kullanıyoruz.
    // Ancak bu sadece başlangıç yüklemesi için geçerli, akış sırasında isStreaming ayrı yönetiliyor.
    setIsSendingMessage(true);
    try {
      const chatDetails = await chatService.getChatDetails(chatId); // chatService.getMessages yerine
      setMessages(chatDetails.messages || []);
    } catch (error) {
      console.error("Mesajlar yüklenirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesajlar yüklenirken bir hata oluştu",
        variant: "destructive",
      });
    } finally {
      setIsSendingMessage(false);
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
    setIsSendingMessage(true)

    try {
      // Optimistic UI update for USER message
      const tempUserMessage: Message = {
        id: `temp-${nanoid()}`, // Geçici ID
        chatId,
        role: "USER",
        content: messageContent,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMessage]);

      const response = await chatService.sendMessage(chatId, messageContent);
      // Backend'den gelen gerçek USER mesajının ID'sini al
      const userMessageId = response.userMsg.id;

      // Optimistik olarak eklediğimiz geçici USER mesajını, gerçek USER mesajıyla değiştir
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempUserMessage.id ? response.userMsg : msg))
      );

      setIsStreaming(true); // Akış başladı
      startStream(userMessageId); // Stream'i başlat ve gerçek USER mesajının ID'sini geç

    } catch (error) {
      console.error("Mesaj gönderilirken hata:", error)
      toast({
        title: "Hata",
        description: "Mesaj gönderilirken bir hata oluştu",
        variant: "destructive",
      })
      // Hata durumunda geçici USER mesajını kaldır
      setMessages((prev) => prev.filter(msg => msg.id.startsWith("temp-") === false));
      setIsStreaming(false);
      setCurrentAssistantMessageId(null);
    } finally {
      setIsSendingMessage(false);
    }
  }

  const handleRegenerateMessage = async (assistantMessageId: string) => {
    if (isSendingMessage || isStreaming) return;

    stopStream();
    setCurrentAssistantMessageId(null);

    setIsSendingMessage(true);
    setIsStreaming(true);

    try {
      const assistantMsgToRegenerate = messagesByIdRef.current.get(assistantMessageId);
      if (!assistantMsgToRegenerate || !assistantMsgToRegenerate.parentId) {
        throw new Error("Yeniden üretilecek mesaj bulunamadı veya parentId yok.");
      }

      // Orijinal kullanıcı mesajını bul
      const userMessage = messagesByIdRef.current.get(assistantMsgToRegenerate.parentId);
      if (!userMessage || userMessage.role !== "USER") {
        throw new Error("Yeniden üretilecek kullanıcı mesajı bulunamadı.");
      }

      // Optimistik olarak eski AI yanıtını kaldır
      setMessages((prev) => prev.filter(msg => msg.id !== assistantMessageId));

      // Tekrar gönderme işlemi için orijinal kullanıcı mesajının içeriğini ve parentId'sini kullan
      const response = await chatService.sendMessage(chatId, userMessage.content, userMessage.id);
      const newUserMessageId = response.userMsg.id; // Backend'den gelen yeni USER mesajının ID'si

      // Optimistik olarak eklediğimiz geçici USER mesajını, gerçek USER mesajıyla değiştir
      setMessages((prev) =>
        prev.map((msg) => (msg.id === `temp-${nanoid()}` && msg.content === userMessage.content ? response.userMsg : msg))
      );

      startStream(newUserMessageId);
      onChatUpdate?.(); // Sohbet listesini güncelle (başlık güncellenmiş olabilir)
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
      setIsSendingMessage(false);
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
              // onRegenerate prop'una sadece AI mesajının ID'sini gönderin
              onRegenerate={message.role === "ASSISTANT" ? handleRegenerateMessage : undefined}
              isStreaming={isStreaming && message.id === currentAssistantMessageId}
            />
          ))}

          {/* Sadece isStreaming true iken ve şu anki akış mesajı henüz yoksa veya akış başlarken */}
          {combinedLoading && !currentAssistantMessageId && (
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
                disabled={combinedLoading}
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