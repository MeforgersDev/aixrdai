import { authService } from "./auth-service"
import type { Chat, Message } from "@/types/chat"

const API_BASE_URL = "https://api.meforgers.com"

class ChatService {
  async getChats(): Promise<Chat[]> {
    const response = await authService.makeAuthenticatedRequest(`${API_BASE_URL}/chats`)

    if (!response.ok) {
      throw new Error("Sohbetler yüklenirken hata oluştu")
    }

    return response.json()
  }

  async createChat(title?: string): Promise<Chat> {
    const response = await authService.makeAuthenticatedRequest(`${API_BASE_URL}/chats`, {
      method: "POST",
      body: JSON.stringify({ title }),
    })

    if (!response.ok) {
      throw new Error("Sohbet oluşturulurken hata oluştu")
    }

    return response.json()
  }

  async deleteChat(chatId: string): Promise<void> {
    const response = await authService.makeAuthenticatedRequest(`${API_BASE_URL}/chats/${chatId}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      throw new Error("Sohbet silinirken hata oluştu")
    }
  }

  async getMessages(chatId: string): Promise<Message[]> {
    const response = await authService.makeAuthenticatedRequest(`${API_BASE_URL}/chats/${chatId}/messages`)

    if (!response.ok) {
      throw new Error("Mesajlar yüklenirken hata oluştu")
    }

    return response.json()
  }

  async sendMessage(
    chatId: string,
    content: string,
    parentId?: string,
  ): Promise<{ userMsg: Message; assistantMsg: Message }> {
    const response = await authService.makeAuthenticatedRequest(`${API_BASE_URL}/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        parentId,
        settings: {
          temperature: 0.7,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Mesaj gönderilirken hata oluştu" }))
      throw new Error(error.message || "Mesaj gönderilirken hata oluştu")
    }

    return response.json()
  }

  async exportChat(chatId: string): Promise<any> {
    const response = await authService.makeAuthenticatedRequest(`${API_BASE_URL}/chats/${chatId}/export`, {
      method: "POST",
    })

    if (!response.ok) {
      throw new Error("Sohbet dışa aktarılırken hata oluştu")
    }

    return response.json()
  }
}

export const chatService = new ChatService()
