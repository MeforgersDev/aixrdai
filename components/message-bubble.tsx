// message-bubble.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check, RotateCcw, User, Bot, Loader2 } from "lucide-react"
import type { Message } from "@/types/chat"
import { toast } from "@/hooks/use-toast"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import remarkGfm from "remark-gfm"

interface MessageBubbleProps {
  message: Message
  onRegenerate?: (messageId: string) => void // Prop'u, AI mesajının kendi ID'sini alacak şekilde değiştirdik
  isStreaming?: boolean
}

export function MessageBubble({ message, onRegenerate, isStreaming }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast({
        title: "Kopyalandı",
        description: "Mesaj panoya kopyalandı",
      })
    } catch (error) {
      toast({
        title: "Hata",
        description: "Mesaj kopyalanırken bir hata oluştu",
        variant: "destructive",
      })
    }
  }

  const handleCodeCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
      toast({
        title: "Kod Kopyalandı",
        description: "Kod panoya kopyalandı",
      })
    } catch (error) {
      toast({
        title: "Hata",
        description: "Kod kopyalanırken bir hata oluştu",
        variant: "destructive",
      })
    }
  }

  const handleRegenerateClick = () => {
    if (onRegenerate && message.role === "ASSISTANT") { // Sadece ASSISTANT mesajları için yeniden üretmeyi tetikle
      onRegenerate(message.id); // AI mesajının kendi ID'sini gönderiyoruz
    }
  }

  const isUser = message.role === "USER"
  const isAssistant = message.role === "ASSISTANT"

  // Yeniden üretme butonunun aktif olup olmayacağını belirle
  // Sadece AI mesajı ise, bir parent'ı varsa ve akış devam etmiyorsa etkin
  const canRegenerate = isAssistant && message.parentId && !isStreaming;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-6`}>
      <div className={`flex max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"} items-start space-x-3`}>
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? "bg-blue-600 ml-3" : "bg-gray-700 mr-3"
          }`}
        >
          {isUser ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
        </div>

        {/* Message Content */}
        <div className={`rounded-2xl px-4 py-3 ${isUser ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-900"}`}>
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "")
                    const language = match ? match[1] : ""
                    const codeString = String(children).replace(/\n$/, "")

                    if (!inline && language) {
                      return (
                        <div className="relative group my-4">
                          <div className="flex items-center justify-between bg-gray-800 text-gray-200 px-4 py-2 rounded-t-lg text-sm">
                            <span className="font-medium">{language}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCodeCopy(codeString)}
                              className="h-6 px-2 text-gray-300 hover:text-white hover:bg-gray-700"
                            >
                              {copiedCode === codeString ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </div>
                          <SyntaxHighlighter
                            style={oneDark}
                            language={language}
                            PreTag="div"
                            className="!mt-0 !rounded-t-none"
                            customStyle={{
                              margin: 0,
                              borderTopLeftRadius: 0,
                              borderTopRightRadius: 0,
                            }}
                            {...props}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      )
                    }

                    return (
                      <code className="bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    )
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-4">
                        <table className="min-w-full border-collapse border border-gray-300 rounded-lg overflow-hidden">
                          {children}
                        </table>
                      </div>
                    )
                  },
                  thead({ children }) {
                    return <thead className="bg-gray-100">{children}</thead>
                  },
                  th({ children }) {
                    return (
                      <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700">
                        {children}
                      </th>
                    )
                  },
                  td({ children }) {
                    return <td className="border border-gray-300 px-4 py-2 text-gray-600">{children}</td>
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 text-gray-700 italic">
                        {children}
                      </blockquote>
                    )
                  },
                  ul({ children }) {
                    return <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                  },
                  ol({ children }) {
                    return <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
                  },
                  li({ children }) {
                    return <li className="text-gray-700">{children}</li>
                  },
                  h1({ children }) {
                    return <h1 className="text-xl font-bold text-gray-800 mt-4 mb-2">{children}</h1>
                  },
                  h2({ children }) {
                    return <h2 className="text-lg font-bold text-gray-800 mt-3 mb-2">{children}</h2>
                  },
                  h3({ children }) {
                    return <h3 className="text-base font-bold text-gray-800 mt-3 mb-1">{children}</h3>
                  },
                  p({ children }) {
                    return <p className="text-gray-700 leading-relaxed mb-2">{children}</p>
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        {children}
                      </a>
                    )
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {/* Akış devam ederken yanıp sönen imleç veya loader göstergesi */}
              {isStreaming && (
                <span className="inline-block w-2 h-5 bg-gray-400 animate-pulse ml-1" />
              )}
            </div>
          )}

          {/* Actions */}
          {isAssistant && (
            <div className="flex items-center space-x-2 mt-3 pt-2 border-t border-gray-200">
              <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2 text-xs text-gray-600">
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? "Kopyalandı" : "Kopyala"}
              </Button>

              {canRegenerate && onRegenerate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerateClick}
                  className="h-6 px-2 text-xs text-gray-600"
                  disabled={!canRegenerate}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Yeniden Üret
                </Button>
              )}
              {isStreaming && ( // Akış sırasında bir loader göster
                 <Loader2 className="h-4 w-4 animate-spin text-gray-600 ml-2" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}