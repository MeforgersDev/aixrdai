"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatInterface } from "@/components/chat-interface"
import { authService } from "@/lib/auth-service"
import { chatService } from "@/lib/chat-service"
import type { Chat } from "@/types/chat"
import { Loader2 } from "lucide-react"

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = authService.getToken()
        if (!token) {
          router.push("/auth/login")
          return
        }
        setIsAuthenticated(true)
        await loadChats()
      } catch (error) {
        router.push("/auth/login")
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const loadChats = async () => {
    try {
      const chatList = await chatService.getChats()
      setChats(chatList)
      if (chatList.length > 0 && !selectedChatId) {
        setSelectedChatId(chatList[0].id)
      }
    } catch (error) {
      console.error("Sohbetler yüklenirken hata:", error)
    }
  }

  const handleNewChat = async (title?: string) => {
    try {
      const newChat = await chatService.createChat(title)
      setChats((prev) => [newChat, ...prev])
      setSelectedChatId(newChat.id)
    } catch (error) {
      console.error("Yeni sohbet oluşturulurken hata:", error)
    }
  }

  const handleDeleteChat = async (chatId: string) => {
    try {
      await chatService.deleteChat(chatId)
      setChats((prev) => prev.filter((chat) => chat.id !== chatId))
      if (selectedChatId === chatId) {
        const remainingChats = chats.filter((chat) => chat.id !== chatId)
        setSelectedChatId(remainingChats.length > 0 ? remainingChats[0].id : null)
      }
    } catch (error) {
      console.error("Sohbet silinirken hata:", error)
    }
  }

  const handleLogout = async () => {
    try {
      await authService.logout()
      router.push("/auth/login")
    } catch (error) {
      console.error("Çıkış yapılırken hata:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <ChatSidebar
        chats={chats}
        selectedChatId={selectedChatId}
        onSelectChat={setSelectedChatId}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onLogout={handleLogout}
      />
      <div className="flex-1">
        {selectedChatId ? (
          <ChatInterface chatId={selectedChatId} onChatUpdate={loadChats} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">Meforgers AI'ya Hoş Geldiniz</h2>
              <p className="text-gray-500 mb-6">Yeni bir sohbet başlatın veya mevcut sohbetlerinizden birini seçin</p>
              <button
                onClick={() => handleNewChat()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Yeni Sohbet Başlat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
