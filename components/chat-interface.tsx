// components/chat-interface.tsx
"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send } from "lucide-react"
import { chatService } from "@/lib/chat-service"
import { useChatStream } from "@/hooks/use-chat-stream"
import type { Message } from "@/types/chat"
import { MessageBubble } from "@/components/message-bubble"
import { toast } from "@/hooks/use-toast"

interface ChatInterfaceProps {
  chatId: string
  onChatUpdate?: () => void
}

export function ChatInterface({ chatId, onChatUpdate }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessageContent, setStreamingMessageContent] = useState(""); // Akış verisi
  const [streamingMessageParentId, setStreamingMessageParentId] = useState<string | undefined>(undefined); // Akış mesajının parentId'si
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Stream'den gelen delta verisini işleyen callback
  const handleDelta = useCallback((delta: string, parentId?: string) => {
    setStreamingMessageContent(delta);
    if (parentId && !streamingMessageParentId) {
      setStreamingMessageParentId(parentId);
    }
  }, [streamingMessageParentId]);

  // Stream tamamlandığında çağrılan callback
  const handleStreamComplete = useCallback(() => {
    setIsStreaming(false);
    setStreamingMessageContent(""); // Akış mesaj içeriğini temizle
    setStreamingMessageParentId(undefined); // parentId'yi temizle
    loadMessages(); // Akış bittiğinde tüm mesajları yeniden yükle
    onChatUpdate?.(); // Sohbet listesinin güncellenmesi için
  }, [chatId, onChatUpdate]);

  const { startStream, stopStream } = useChatStream(
    chatId,
    handleDelta,
    handleStreamComplete,
  );

  useEffect(() => {
    loadMessages();
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessageContent]); // streamingMessageContent değiştikçe de scroll yap

  const loadMessages = async () => {
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
    }
  };

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || isStreaming) return;

    const messageContent = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    // Optimistik UI güncellemesi: Kullanıcının mesajını hemen göster
    const tempUserMessage: Message = {
      id: `temp-user-${Date.now()}`, // Geçici bir ID
      chatId,
      role: "USER",
      content: messageContent,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      setIsStreaming(true); // Akış başlayacak
      startStream(); // SSE akışını başlat

      // Mesajı backend'e gönder ve cevabı bekle (burada sadece userMsg'nin ID'si lazım olabilir)
      const { userMsg } = await chatService.sendMessage(chatId, messageContent);
      // Backend'den gelen userMsg'nin gerçek ID'sini kullanmak için
      // Optimistik olarak eklenen mesajı gerçek mesajla değiştirme veya ID'sini güncelleme
      setMessages((prev) => prev.map(msg => 
          msg.id === tempUserMessage.id ? { ...userMsg, createdAt: userMsg.createdAt || tempUserMessage.createdAt } : msg
      ));
      
      // parentId'yi burada ayarlayabiliriz eğer `chat.delta` olayında gelmiyorsa
      // veya `chat.delta` olayında gelmesini sağlarsak bu satıra gerek kalmaz.
      // Şu anki backend kodunda `chat.delta` `parentId` göndermediği için burada ayarlayabiliriz.
      setStreamingMessageParentId(userMsg.id); // Yapay zeka mesajının parent'ı kullanıcı mesajı olacak
      
    } catch (error) {
      console.error("Mesaj gönderilirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesaj gönderilirken bir hata oluştu",
        variant: "destructive",
      });
      // Hata durumunda akış durumlarını sıfırla
      stopStream();
      setIsStreaming(false);
      setStreamingMessageContent("");
      setStreamingMessageParentId(undefined);
      // Optimistik olarak eklenen kullanıcı mesajını geri al
      setMessages((prev) => prev.filter(msg => msg.id !== tempUserMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateMessage = async (parentId: string, content: string) => {
    if (isLoading || isStreaming) return;

    setIsLoading(true);

    // Optimistik UI güncellemesi (isteğe bağlı: AI cevabını listeden kaldırabiliriz)
    setMessages((prev) => prev.filter(msg => msg.parentId !== parentId || msg.role === "USER")); // AI cevabını kaldır

    try {
      setIsStreaming(true);
      startStream();
      await chatService.sendMessage(chatId, content, parentId); // parentId'yi burada gönder
      setStreamingMessageParentId(parentId); // Yeniden üretilen mesajın parent'ı
    } catch (error) {
      console.error("Mesaj yeniden üretilirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesaj yeniden üretilirken bir hata oluştu",
        variant: "destructive",
      });
      stopStream();
      setIsStreaming(false);
      setStreamingMessageContent("");
      setStreamingMessageParentId(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Akışta olan mesajı render etmek için dinamik ID oluşturma
  const streamingMessageId = streamingMessageParentId ? `streaming-${streamingMessageParentId}` : "streaming";

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-1">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} onRegenerate={handleRegenerateMessage} />
          ))}

          {/* Streaming message */}
          {isStreaming && streamingMessageContent && (
            <MessageBubble
              message={{
                id: streamingMessageId,
                chatId,
                role: "ASSISTANT",
                content: streamingMessageContent,
                createdAt: new Date().toISOString(),
                parentId: streamingMessageParentId, // Parent ID'yi de ekle
              }}
              isStreaming={true}
            />
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
                disabled={isLoading || isStreaming}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading || isStreaming}
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
  );
}