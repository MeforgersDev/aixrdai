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
    if (parentId) {
      setStreamingMessageParentId(parentId); // İlk gelen parentId'yi kaydet
    }
  }, []); // Bağımlılık dizisi boş kalabilir çünkü sadece state güncelliyor

  // Stream tamamlandığında çağrılan callback
  const handleStreamComplete = useCallback((finalContent: string, parentId?: string) => {
    setIsStreaming(false);
    
    // Akış mesajını kalıcı mesaj olarak ekle
    if (finalContent.trim()) {
      setMessages((prevMessages) => {
        // Eğer zaten akış mesajı (parentId ile) listede varsa, onu güncelle.
        // Yoksa, yeni bir AI mesajı olarak ekle.
        const existingAiMessageIndex = prevMessages.findIndex(
            (msg) => msg.parentId === parentId && msg.role === "ASSISTANT" && msg.id.startsWith("temp-ai-")
        );

        if (existingAiMessageIndex > -1) {
            // Geçici AI mesajını final içerikle güncelle
            const updatedMessages = [...prevMessages];
            updatedMessages[existingAiMessageIndex] = {
                ...updatedMessages[existingAiMessageIndex],
                content: finalContent,
                id: updatedMessages[existingAiMessageIndex].id.replace('temp-ai-', 'real-ai-'), // Geçici ID'yi gerçekçi yap
                createdAt: new Date().toISOString(), // Oluşturulma zamanını güncelle
            };
            return updatedMessages;
        } else {
            // Yeni bir AI mesajı olarak ekle
            return [
                ...prevMessages,
                {
                    id: `ai-${Date.now()}`, // Benzersiz bir ID
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

    setStreamingMessageContent(""); // Akış mesaj içeriğini temizle
    setStreamingMessageParentId(undefined); // parentId'yi temizle
    // loadMessages(); // Bu satırı yorum satırı yapın veya kaldırın.
    onChatUpdate?.(); // Sohbet listesinin güncellenmesi için (başlık vs. değişmiş olabilir)
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

    const tempUserMessageId = `temp-user-${Date.now()}`;
    const tempAiMessageId = `temp-ai-${Date.now() + 1}`; // AI için geçici ID

    // Optimistik UI güncellemesi: Kullanıcının mesajını ve boş bir AI yer tutucusunu hemen göster
    const tempUserMessage: Message = {
      id: tempUserMessageId,
      chatId,
      role: "USER",
      content: messageContent,
      createdAt: new Date().toISOString(),
    };
    const tempAiMessage: Message = {
      id: tempAiMessageId,
      chatId,
      role: "ASSISTANT",
      content: "", // Başlangıçta boş
      createdAt: new Date().toISOString(),
      parentId: tempUserMessageId, // Kullanıcı mesajının ID'si parent olacak
    };

    setMessages((prev) => [...prev, tempUserMessage, tempAiMessage]); // İki mesajı birden ekle

    try {
      setIsStreaming(true); // Akış başlayacak
      startStream(); // SSE akışını başlat

      // Mesajı backend'e gönder. Backend userMsg'nin gerçek ID'sini döndürecek.
      const { userMsg } = await chatService.sendMessage(chatId, messageContent);
      
      // Optimistik olarak eklenen kullanıcı mesajını, backend'den gelen gerçek ID ile güncelle
      setMessages((prev) => prev.map(msg => 
          msg.id === tempUserMessageId ? { ...userMsg, createdAt: userMsg.createdAt || tempUserMessage.createdAt } : msg
      ));
      
      // Akış mesajının parentId'sini, backend'den gelen userMsg.id ile ayarla
      // Bu, akış sırasında doğru mesajın güncellenmesini sağlayacak.
      setStreamingMessageParentId(userMsg.id); 
      
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
      setStreamingMessageContent("");
      setStreamingMessageParentId(undefined);
      setMessages((prev) => prev.filter(msg => msg.id !== tempUserMessageId && msg.id !== tempAiMessageId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateMessage = async (parentId: string, content: string) => {
    if (isLoading || isStreaming) return;

    setIsLoading(true);

    // AI cevabını listeden kaldır
    setMessages((prev) => prev.filter(msg => msg.parentId !== parentId || msg.role === "USER")); 

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
      setMessages((prev) => prev.filter(msg => msg.id !== tempRegeneratedAiMessageId)); // Hata olursa geçici mesajı kaldır
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
  // Bu artık doğrudan MessageBubble listesine dahil edildiği için,
  // akış sırasında `messages` state'i güncellenir.
  // Bu değişkeni kullanmıyoruz, ancak kodunuzda kalabilir.
  // const streamingMessageId = streamingMessageParentId ? `streaming-${streamingMessageParentId}` : "streaming";


  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-1">
          {messages.map((message) => {
            // Akış sırasında olan AI mesajını burada yakala ve güncel içeriğini gönder
            // Eğer mesajın parentId'si streamingMessageParentId ile eşleşiyor ve rolü ASSISTANT ise,
            // ve current streamingMessageContent boş değilse, bu mesajı akış içeriğiyle render et.
            // Bu sayede tek bir mesaj kabarcığı akış sırasında güncellenebilir.
            const isCurrentStreamingAiMessage = 
                isStreaming && 
                message.role === "ASSISTANT" && 
                message.parentId === streamingMessageParentId &&
                message.id.startsWith("temp-ai-"); // Sadece geçici AI mesajlarını etkile

            return (
              <MessageBubble 
                key={message.id} 
                message={{
                  ...message,
                  content: isCurrentStreamingAiMessage ? streamingMessageContent : message.content,
                }} 
                isStreaming={isCurrentStreamingAiMessage} // Akışta olup olmadığını belirt
                onRegenerate={handleRegenerateMessage} 
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