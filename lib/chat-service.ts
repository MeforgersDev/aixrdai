import { authService } from "./auth-service"
import type { Chat, Message } from "@/types/chat" // Chat tipini de import etmeliyiz

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
    // Bu metod, backend'deki Post('chats') endpoint'ine karşılık gelir.
    // Ancak backend'deki SendMessage metodu da null chatId ile yeni chat oluşturduğu için
    // bu metodun çağrılması yeni bir chat oluşturur ve ilk mesaj gönderilmeden boş kalır.
    // Frontend'de bu metodun kullanım amacı "yeni bir boş sohbet başlat" ise uygundur.
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

  // Düzeltme: Backend'deki /chats/:id endpoint'i artık mesajları da getiriyor.
  // Bu nedenle getMessages yerine getChatDetails adını kullanabiliriz.
  // Bu metod Chat nesnesini döndürecek, içinde messages dizisi olacak.
  async getChatDetails(chatId: string): Promise<Chat> {
    const response = await authService.makeAuthenticatedRequest(`${API_BASE_URL}/chats/${chatId}`)

    if (!response.ok) {
      throw new Error("Sohbet detayları yüklenirken hata oluştu")
    }

    return response.json()
  }

  async sendMessage(
    chatId: string | null, // chatId null olabilir (yeni sohbet için)
    content: string,
    parentId?: string,
  ): Promise<{ chat: Chat; userMsg: Message; assistantMsg: Message }> {
    let url: string;
    let method: string = "POST";
    let body: object;

    if (chatId) {
      // Mevcut sohbete mesaj gönderme
      url = `${API_BASE_URL}/chats/${chatId}/messages`;
      body = {
        content,
        parentId,
        settings: {
          temperature: 0.7,
        },
      };
    } else {
      // Yeni sohbet başlatma
      url = `${API_BASE_URL}/chats/messages`; // Backend'deki Post('messages') endpoint'i
      body = {
        content,
        parentId, // Yeni sohbette parentId genelde olmaz ama yine de yollanabilir
        settings: {
          temperature: 0.7,
        },
      };
    }

    const response = await authService.makeAuthenticatedRequest(url, {
      method: method,
      body: JSON.stringify(body),
    });

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