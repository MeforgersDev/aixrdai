// components/chat-interface.tsx
"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
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
  const [streamingMessage, setStreamingMessage] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleStreamComplete = useCallback(() => {
    setIsStreaming(false);
    setStreamingMessage(""); // Akış bittiğinde streamingMessage'i temizle
    loadMessages(); // Akış bittiğinde tüm mesajları yeniden yükle
    onChatUpdate?.(); // Sohbet listesinin güncellenmesi için
  }, [chatId, onChatUpdate]); // Bağımlılıkları ekleyin

  const { startStream, stopStream } = useChatStream(
    chatId,
    (delta) => {
      setStreamingMessage(delta);
    },
    handleStreamComplete, // Callback olarak pass et
  );

  useEffect(() => {
    loadMessages();
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

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
    setIsLoading(true); // Yükleniyor durumuna geç

    // Optimistik UI güncellemesi
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      chatId,
      role: "USER",
      content: messageContent,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      setIsStreaming(true); // Akış başlatılacak
      startStream(); // Akış başlat
      await chatService.sendMessage(chatId, messageContent);
      // sendMessage tamamlandığında, stream bitiminde handleStreamComplete çağrılacak
    } catch (error) {
      console.error("Mesaj gönderilirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesaj gönderilirken bir hata oluştu",
        variant: "destructive",
      });
      // Hata durumunda akış durumlarını sıfırla
      stopStream(); // Akışı durdur
      setIsStreaming(false);
      setStreamingMessage("");
      // Hatalı gönderilen mesajı listeden kaldırabilir veya hata mesajı gösterebilirsiniz.
      // Şimdilik sadece toast göstereceğiz.
    } finally {
      setIsLoading(false); // Yükleniyor durumundan çık
    }
  };

  const handleRegenerateMessage = async (parentId: string, content: string) => {
    if (isLoading || isStreaming) return;

    setIsLoading(true); // Yükleniyor durumuna geç

    try {
      setIsStreaming(true); // Akış başlatılacak
      startStream(); // Akış başlat
      await chatService.sendMessage(chatId, content, parentId);
      // sendMessage tamamlandığında, stream bitiminde handleStreamComplete çağrılacak
    } catch (error) {
      console.error("Mesaj yeniden üretilirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesaj yeniden üretilirken bir hata oluştu",
        variant: "destructive",
      });
      // Hata durumunda akış durumlarını sıfırla
      stopStream(); // Akışı durdur
      setIsStreaming(false);
      setStreamingMessage("");
    } finally {
      setIsLoading(false); // Yükleniyor durumundan çık
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-1">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} onRegenerate={handleRegenerateMessage} />
          ))}

          {/* Streaming message */}
          {isStreaming && streamingMessage && (
            <MessageBubble
              message={{
                id: "streaming", // Geçici ID
                chatId,
                role: "ASSISTANT",
                content: streamingMessage,
                createdAt: new Date().toISOString(), // Geçici zaman damgası
              }}
              isStreaming={true} // Akışta olduğunu belirt
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