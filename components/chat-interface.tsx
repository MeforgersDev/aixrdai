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
  const [isLoading, setIsLoading] = useState(false) // Mesaj gönderme API'sinin durumu
  const [isStreaming, setIsStreaming] = useState(false) // Akışın aktif olup olmadığını kontrol eder

  // Akış sırasında güncellenecek geçici AI mesajının içeriği ve parentId'si
  const [currentStreamingContent, setCurrentStreamingContent] = useState("");
  const [currentStreamingParentId, setCurrentStreamingParentId] = useState<string | undefined>(undefined);

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Stream'den gelen delta verisini işleyen callback
  const handleDelta = useCallback((delta: string, parentId?: string) => {
    // Burada delta, tüm birikmiş akış içeriğidir.
    // Optimistik UI'da temp AI mesajını güncellemek için kullanılır.
    setCurrentStreamingContent(delta);
    if (parentId && !currentStreamingParentId) {
      setCurrentStreamingParentId(parentId);
    }
  }, [currentStreamingParentId]);

  // Stream tamamlandığında çağrılan callback
  const handleStreamComplete = useCallback(({ finalContent, parentId, assistantMessageId }) => {
    setIsStreaming(false);
    setCurrentStreamingContent("");
    setCurrentStreamingParentId(undefined);

    if (finalContent.trim()) {
        setMessages((prevMessages) => {
            // Optimistik olarak eklenen geçici AI mesajını bul
            const existingAiMessageIndex = prevMessages.findIndex(
                (msg) => msg.parentId === parentId && msg.role === "ASSISTANT" && msg.id.startsWith("temp-ai-")
            );

            if (existingAiMessageIndex > -1) {
                // Geçici AI mesajını final içerikle ve gerçek ID ile güncelle
                const updatedMessages = [...prevMessages];
                updatedMessages[existingAiMessageIndex] = {
                    ...updatedMessages[existingAiMessageIndex],
                    content: finalContent,
                    id: assistantMessageId || updatedMessages[existingAiMessageIndex].id,
                    createdAt: new Date().toISOString(),
                };
                return updatedMessages;
            } else {
                // Yedek durum: Eğer geçici mesaj bulunamazsa, yeni bir AI mesajı olarak ekle
                return [
                    ...prevMessages,
                    {
                        id: assistantMessageId || `ai-${Date.now()}`,
                        chatId,
                        role: "ASSISTANT",
                        content: finalContent,
                        createdAt: new Date().toISOString(),
                        parentId: parentId,
                    },
                ];
            }
        });
    }
    onChatUpdate?.(); // Sohbet listesinin güncellenmesi için
  }, [chatId, onChatUpdate]);

  // useChatStream hook'unu burada çağır
  const { startStream, stopStream } = useChatStream(
    chatId,
    handleDelta,
    handleStreamComplete,
  );

  useEffect(() => {
    loadMessages();
  }, [chatId]);

  useEffect(() => {
    // Mesajlar veya akış içeriği değiştiğinde en aşağı kaydır
    scrollToBottom();
  }, [messages, currentStreamingContent]); 

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
    setIsLoading(true); // Mesaj gönderme API çağrısının yüklenme durumu

    const tempUserMessageId = `temp-user-${Date.now()}`;
    const tempAiMessageId = `temp-ai-${Date.now() + 1}`; 

    // Optimistik UI güncellemesi: Kullanıcının mesajını ve boş bir AI yer tutucusunu hemen göster
    const tempUserMessage: Message = {
      id: tempUserMessageId,
      chatId,
      role: "USER",
      content: messageContent,
      createdAt: new Date().toISOString(),
      parentId: undefined,
    };
    const tempAiMessage: Message = {
      id: tempAiMessageId,
      chatId,
      role: "ASSISTANT",
      content: "", // Başlangıçta boş
      createdAt: new Date().toISOString(),
      parentId: tempUserMessageId, // Kullanıcı mesajının ID'si parent olacak
    };

    // Mesajları state'e ekle
    setMessages((prev) => [...prev, tempUserMessage, tempAiMessage]);
    setCurrentStreamingParentId(tempUserMessageId); // Geçici AI mesajının parentId'sini ayarla
    setIsStreaming(true); // Akış başlayacak

    try {
      // Backend'e mesajı gönder. Bu çağrı artık hemen dönecek ve sadece userMsg'yi içerecek.
      const { userMsg } = await chatService.sendMessage(chatId, messageContent, undefined);

      // Optimistik olarak eklenen kullanıcı mesajını, backend'den gelen gerçek ID ile güncelle
      setMessages((prev) => prev.map(msg => 
          msg.id === tempUserMessageId ? { ...userMsg, createdAt: userMsg.createdAt } : msg
      ));
      
      // Backend mesajı kaydettikten sonra, stream'i başlatmak için hemen çağır.
      // Backend, Gemini'den gelen delta'ları bu stream'e göndermeye başlayacak.
      startStream(); 
      
    } catch (error) {
      console.error("Mesaj gönderilirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesaj gönderilirken bir hata oluştu",
        variant: "destructive",
      });
      // Hata durumunda akış durumlarını sıfırla ve optimistik mesajları kaldır
      stopStream();
      setIsStreaming(false);
      setCurrentStreamingContent("");
      setCurrentStreamingParentId(undefined);
      // Sadece bu sohbet akışına ait geçici mesajları kaldır
      setMessages((prev) => prev.filter(msg => 
          msg.id !== tempUserMessageId && msg.id !== tempAiMessageId && !msg.id.startsWith("temp-")
      ));
    } finally {
      setIsLoading(false); // Sadece mesaj gönderme API çağrısı bitince
    }
  };

  const handleRegenerateMessage = async (parentId: string, userMessageContent: string) => {
    if (isLoading || isStreaming) return;

    setIsLoading(true);

    // AI cevabını listeden kaldır (yalnızca parentId'si eşleşen ASSISTANT rolündeki mesajı)
    setMessages((prev) => prev.filter(msg => 
        !(msg.parentId === parentId && msg.role === "ASSISTANT")
    )); 

    // Yeniden üretilen AI mesajı için geçici bir yer tutucu ekle
    const tempRegeneratedAiMessageId = `temp-ai-regen-${Date.now()}`;
    const tempRegeneratedAiMessage: Message = {
      id: tempRegeneratedAiMessageId,
      chatId,
      role: "ASSISTANT",
      content: "",
      createdAt: new Date().toISOString(),
      parentId: parentId, // Aynı parentId'yi kullan
    };
    setMessages((prev) => [...prev, tempRegeneratedAiMessage]);
    setCurrentStreamingParentId(parentId); // Yeniden üretilen mesajın parent'ı
    setIsStreaming(true); // Akış başlayacak

    try {
      // Backend'e mesajı gönder. userMsg altyapısı olduğu için yine userMsg'yi dönecektir.
      await chatService.sendMessage(chatId, userMessageContent, parentId);
      startStream();
    } catch (error) {
      console.error("Mesaj yeniden üretilirken hata:", error);
      toast({
        title: "Hata",
        description: "Mesaj yeniden üretilirken bir hata oluştu",
        variant: "destructive",
      });
      stopStream();
      setIsStreaming(false);
      setCurrentStreamingContent("");
      setCurrentStreamingParentId(undefined);
      // Hata olursa geçici mesajı kaldır
      setMessages((prev) => prev.filter(msg => msg.id !== tempRegeneratedAiMessageId)); 
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

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-1">
          {messages.map((message) => {
            const isCurrentStreamingAiMessage = 
                isStreaming && 
                message.role === "ASSISTANT" && 
                message.parentId === currentStreamingParentId &&
                message.id.startsWith("temp-ai-");

            return (
              <MessageBubble 
                key={message.id} 
                message={{
                  ...message,
                  content: isCurrentStreamingAiMessage ? currentStreamingContent : message.content,
                }} 
                isStreaming={isCurrentStreamingAiMessage}
                onRegenerate={
                  message.role === "USER" && !isStreaming 
                    ? (id: string) => {
                        handleRegenerateMessage(id, message.content);
                      } 
                    : undefined
                } 
              />
            );
          })}
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