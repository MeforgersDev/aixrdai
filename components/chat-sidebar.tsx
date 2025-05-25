"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MessageSquare, Plus, Trash2, LogOut, Settings, Search, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Chat } from "@/types/chat"
import { formatDistanceToNow } from "date-fns"
import { tr } from "date-fns/locale"

interface ChatSidebarProps {
  chats: Chat[]
  selectedChatId: string | null
  onSelectChat: (chatId: string) => void
  onNewChat: (title?: string) => void
  onDeleteChat: (chatId: string) => void
  onLogout: () => void
}

export function ChatSidebar({
  chats,
  selectedChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onLogout,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredChats = chats.filter(
    (chat) =>
      chat.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      "yeni sohbet".includes(searchQuery.toLowerCase()),
  )

  const formatChatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), {
        addSuffix: true,
        locale: tr,
      })
    } catch {
      return "Bilinmeyen zaman"
    }
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold">Meforgers AI</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Ayarlar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Çıkış Yap
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button onClick={() => onNewChat()} className="w-full mb-4" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Yeni Sohbet
        </Button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Sohbetlerde ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredChats.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-sm">Henüz sohbet yok</p>
              <p className="text-xs text-gray-400 mt-1">Yeni bir sohbet başlatın</p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                className={`group relative p-3 rounded-lg cursor-pointer transition-colors mb-1 ${
                  selectedChatId === chat.id ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50"
                }`}
                onClick={() => onSelectChat(chat.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">{chat.title || "Yeni Sohbet"}</h3>
                    <p className="text-xs text-gray-500 mt-1">{formatChatTime(chat.updatedAt)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteChat(chat.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
