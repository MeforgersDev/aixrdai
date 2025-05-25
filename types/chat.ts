export interface Chat {
  id: string
  title?: string
  userId: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  chatId: string
  role: "USER" | "ASSISTANT" | "SYSTEM"
  content: string
  parentId?: string
  children?: Message[]
  createdAt: string
}

export interface SendMessageDto {
  content: string
  parentId?: string
  settings?: {
    temperature?: number
  }
}
