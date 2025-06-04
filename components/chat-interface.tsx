// components/chat-interface.tsx
"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react" // useCallback eklendi
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

  // onStreamComplete callback'i oluştur
  const onStreamComplete = useCallback(
    (fullMessage: string) => {
      setIsStreaming(false)
      setStreamingMessage("") // Streaming mesajını temizle

      if (fullMessage) {
        // Yeni bir ASSISTANT mesajı oluştur ve listeye ekle
        const newMessage: Message = {
          id: `ai-${Date.now()}`, // Gerçek ID backend'den gelmeli, ama burada geçici
          chatId,
          role: "ASSISTANT",
          content: fullMessage,
          createdAt: new Date().toISOString(),
        }
        setMessages((prev) => {
          // Eğer en son mesaj bir temp user mesajı ise, o zaman gerçek AI mesajını ekle
          // veya eğer zaten bir streaming mesajı varsa, onu güncelle
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.id.startsWith("temp-") && lastMessage.role === "USER") {
              // Temp user mesajının hemen arkasına AI mesajını ekle
              return [...prev, newMessage];
          }
          // Diğer durumlarda (örn. doğrudan re-generate sonrası), sadece ekle
          return [...prev, newMessage];
        });
      }
      loadMessages(); // Mesajları backend'den tekrar yükle (ID'lerin güncellenmesi ve tutarlılık için)
      onChatUpdate?.(); // Sohbet listesini güncelle
    },
    [chatId, onChatUpdate],
  );

  const { startStream, stopStream } = useChatStream(
    chatId,
    (delta) => {
      setStreamingMessage(delta)
    },
    onStreamComplete, // Güncellenmiş callback'i gönder
  );

  useEffect(() => {
    loadMessages()
  }, [chatId])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingMessage])

  const loadMessages = async () => {
    try {
      const messageList = await chatService.getMessages(chatId)
      setMessages(messageList)
    } catch (error) {
      console.error("Mesajlar yüklenirken hata:", error)
      toast({
        title: "Hata",
        description: "Mesajlar yüklenirken bir hata oluştu",
        variant: "destructive",
      })
    }
  }

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || isStreaming) return

    const messageContent = inputValue.trim()
    setInputValue("")
    setIsLoading(true)
    setIsStreaming(true) // Streaming başladığını belirt

    try {
      // Optimistic UI update: Kullanıcı mesajını hemen ekle
      const tempUserMessage: Message = {
        id: `temp-${Date.now()}`, // Geçici ID
        chatId,
        role: "USER",
        content: messageContent,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, tempUserMessage])

      // Mesajı backend'e gönder ve akışı başlat
      // sendMessage API'si aslında sadece tetikleyici olmalı, yanıtı SSE'den bekliyoruz.
      await chatService.sendMessage(chatId, messageContent);

      // Akışı başlat (bu işlem sendMessage'dan ayrı veya paralel olabilir)
      // Eğer backend'den sendMessage işlemi sonrası SSE bağlantısı otomatik başlamıyorsa,
      // bu çağrı burada gerekli olacaktır. Mevcut backend yapınızda SSE endpoint'i zaten mevcut.
      startStream();

    } catch (error) {
      console.error("Mesaj gönderilirken hata:", error)
      toast({
        title: "Hata",
        description: "Mesaj gönderilirken bir hata oluştu",
        variant: "destructive",
      })
      // Hata durumunda streaming ve loading state'lerini resetle
      setIsStreaming(false)
      setStreamingMessage("")
      // Optimistic UI update'i geri alabiliriz veya kullanıcıya hata gösterebiliriz
      setMessages(prev => prev.filter(msg => !msg.id.startsWith("temp-"))); // Geçici mesajı kaldır
    } finally {
      setIsLoading(false)
      // `onStreamComplete` çağrıldığında `setIsStreaming(false)` ayarlanacağı için burada tekrar ayarlamaya gerek yok.
    }
  }

  const handleRegenerateMessage = async (parentId: string, content: string) => {
    if (isLoading || isStreaming) return

    setIsLoading(true)
    setIsStreaming(true) // Streaming başladığını belirt

    try {
      // Regenerate işleminde de yeni bir temp user mesajı ekleyebiliriz
      const tempUserMessage: Message = {
        id: `temp-${Date.now()}-regen`,
        chatId,
        role: "USER",
        content: content, // Yeniden üretilecek mesajın içeriği
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMessage]);

      // Eski AI yanıtını kaldır (eğer parentId ile ilgili AI mesajı varsa)
      setMessages(prev => prev.filter(msg => msg.parentId !== parentId || msg.role === "USER")); // Önceki AI yanıtını kaldır

      await chatService.sendMessage(chatId, content, parentId); // ParentId ile gönder
      startStream(); // Akışı başlat

    } catch (error) {
      console.error("Mesaj yeniden üretilirken hata:", error)
      toast({
        title: "Hata",
        description: "Mesaj yeniden üretilirken bir hata oluştu",
        variant: "destructive",
      })
      setIsStreaming(false)
      setStreamingMessage("")
      setMessages(prev => prev.filter(msg => !msg.id.startsWith("temp-"))); // Geçici mesajı kaldır
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

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
                createdAt: new Date().toISOString(),
              }}
              isStreaming={true}
            />
          )}
          {/* Eğer isStreaming true ise ve streamingMessage boşsa (yani henüz bir delta gelmediyse) */}
          {isStreaming && !streamingMessage && (
            <MessageBubble
              message={{
                id: "loading",
                chatId,
                role: "ASSISTANT",
                content: "Yapay zeka yanıt oluşturuyor...", // Yükleniyor mesajı
                createdAt: new Date().toISOString(),
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
  )
}