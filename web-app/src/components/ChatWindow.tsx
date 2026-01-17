'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { authService } from '@/services/authService'
import ChatSidebar from './ChatSidebar'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

interface Conversation {
    id: number
    title: string
    created_at: string
    updated_at: string
}

export default function ChatWindow() {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [loadingHistory, setLoadingHistory] = useState(false)

    // Conversation state
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState(true)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const isProduction = process.env.NODE_ENV === 'production'
    const API_URL = process.env.NEXT_PUBLIC_API_URL !== undefined
        ? process.env.NEXT_PUBLIC_API_URL
        : (isProduction ? '' : 'http://localhost:8000')

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Load conversations when chat opens
    useEffect(() => {
        if (isOpen) {
            loadConversations()
        }
    }, [isOpen])

    // Load messages when conversation changes
    useEffect(() => {
        if (activeConversationId) {
            loadConversationMessages(activeConversationId)
        }
    }, [activeConversationId])

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const loadConversations = async () => {
        try {
            const response = await fetch(`${API_URL}/api/conversations/`, {
                headers: { 'Authorization': `Bearer ${authService.getToken()}` }
            })
            if (response.ok) {
                const convs = await response.json()
                setConversations(convs)

                // Auto-select most recent conversation
                if (convs.length > 0 && !activeConversationId) {
                    setActiveConversationId(convs[0].id)
                }
            }
        } catch (error) {
            console.error('Failed to load conversations:', error)
        }
    }

    const loadConversationMessages = async (conversationId: number) => {
        setLoadingHistory(true)
        try {
            const response = await fetch(
                `${API_URL}/api/chat/history?conversation_id=${conversationId}&limit=50`,
                { headers: { 'Authorization': `Bearer ${authService.getToken()}` } }
            )

            if (response.ok) {
                const history = await response.json()
                setMessages(history.map((msg: any) => ({
                    role: msg.role,
                    content: msg.content
                })))
            }
        } catch (error) {
            console.error('Failed to load messages:', error)
        } finally {
            setLoadingHistory(false)
        }
    }

    const createNewConversation = async (firstMessage: string): Promise<number | null> => {
        try {
            // Auto-generate meaningful title from first message
            let title = firstMessage.trim()

            // Remove common task prefixes for cleaner titles
            const prefixes = ['add task', 'create task', 'new task', 'add a task', 'create a task', 'add', 'create']
            const lowerMessage = title.toLowerCase()

            for (const prefix of prefixes) {
                if (lowerMessage.startsWith(prefix)) {
                    title = title.substring(prefix.length).trim()
                    break
                }
            }

            // Capitalize first letter
            if (title) {
                title = title.charAt(0).toUpperCase() + title.slice(1)
            }

            // Limit to 50 characters
            if (title.length > 50) {
                title = title.substring(0, 47) + '...'
            }

            // Fallback to first 50 chars if empty after processing
            if (!title) {
                title = firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : '')
            }

            const response = await fetch(`${API_URL}/api/conversations/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authService.getToken()}`
                },
                body: JSON.stringify({ title })
            })

            if (response.ok) {
                const newConv = await response.json()
                // Reload all conversations to ensure sidebar is updated
                await loadConversations()
                setActiveConversationId(newConv.id)
                return newConv.id
            }
        } catch (error) {
            console.error('Failed to create conversation:', error)
        }
        return null
    }

    const handleNewChat = () => {
        setActiveConversationId(null)
        setMessages([{
            role: 'assistant',
            content: 'Hi! I can help you manage your tasks. Try "Add a task to buy milk" or "List my tasks".'
        }])
        // Conversations stay in sidebar - no need to clear them!
    }

    const handleSelectConversation = (id: number) => {
        setActiveConversationId(id)
    }

    const handleDeleteConversation = async (id: number) => {
        try {
            const response = await fetch(`${API_URL}/api/conversations/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authService.getToken()}` }
            })

            if (response.ok) {
                setConversations(prev => prev.filter(c => c.id !== id))
                if (activeConversationId === id) {
                    handleNewChat()
                }
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error)
        }
    }

    const handleRenameConversation = async (id: number, newTitle: string) => {
        try {
            const response = await fetch(`${API_URL}/api/conversations/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authService.getToken()}`
                },
                body: JSON.stringify({ title: newTitle })
            })

            if (response.ok) {
                const updated = await response.json()
                setConversations(prev => prev.map(c => c.id === id ? updated : c))
            }
        } catch (error) {
            console.error('Failed to rename conversation:', error)
        }
    }

    const saveMessageToBackend = async (role: string, content: string, source?: string, conversationId?: number) => {
        try {
            await fetch(`${API_URL}/api/chat/save-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authService.getToken()}`
                },
                body: JSON.stringify({
                    role,
                    content,
                    source,
                    conversation_id: conversationId ?? activeConversationId
                })
            })
        } catch (error) {
            console.error('Failed to save message:', error)
        }
    }

    const handleSend = async () => {
        if (!input.trim() || isLoading) return

        const userMessage: Message = { role: 'user', content: input }
        setMessages(prev => [...prev, userMessage])
        const messageContent = input
        setInput('')
        setIsLoading(true)

        // Create new conversation if needed (this will auto-generate title from message)
        let convId = activeConversationId
        if (!convId) {
            convId = await createNewConversation(messageContent)
        }

        // Save user message
        saveMessageToBackend('user', userMessage.content, undefined, convId ?? undefined)

        try {
            const response = await fetch(`${API_URL}/api/chat/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authService.getToken()}`
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    model: "google/gemini-2.0-flash-exp:free"
                })
            })

            if (!response.ok) throw new Error('Failed to send message')

            const data = await response.json()
            const aiContent = data.response + (data.source ? `\n\n*(Powered by ${data.source})*` : '')

            const assistantMessage = { role: 'assistant' as const, content: aiContent }
            setMessages(prev => [...prev, assistantMessage])

            // Save assistant message
            saveMessageToBackend('assistant', data.response, data.source, convId ?? undefined)

        } catch (error) {
            const errorMessage = { role: 'assistant' as const, content: 'Sorry, I encountered an error. Please try again.' }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
            <div className="pointer-events-auto">
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            className="mb-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl flex overflow-hidden"
                            style={{ width: sidebarOpen ? '550px' : '340px', height: '450px' }}
                        >
                            {/* Sidebar */}
                            <ChatSidebar
                                conversations={conversations}
                                activeConversationId={activeConversationId}
                                onSelectConversation={handleSelectConversation}
                                onNewChat={handleNewChat}
                                onDeleteConversation={handleDeleteConversation}
                                onRenameConversation={handleRenameConversation}
                                isOpen={sidebarOpen}
                            />

                            {/* Chat Area */}
                            <div className="flex-1 flex flex-col">
                                {/* Header */}
                                <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setSidebarOpen(!sidebarOpen)}
                                            className="p-1 hover:bg-white/10 rounded transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                            </svg>
                                        </button>
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                        <h3 className="font-semibold text-white">AI Assistant</h3>
                                    </div>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="text-white/50 hover:text-white transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                    {loadingHistory ? (
                                        <div className="flex justify-center items-center h-full">
                                            <div className="flex gap-1">
                                                <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                                                <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                                <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {messages.map((msg, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                                >
                                                    <div
                                                        className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === 'user'
                                                            ? 'bg-purple-600 text-white rounded-tr-sm shadow-lg shadow-purple-900/20'
                                                            : 'bg-white/10 text-gray-200 rounded-tl-sm border border-white/5'
                                                            }`}
                                                    >
                                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {isLoading && (
                                                <div className="flex justify-start">
                                                    <div className="bg-white/10 rounded-2xl p-3 rounded-tl-sm border border-white/5">
                                                        <div className="flex gap-1">
                                                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                                                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            <div ref={messagesEndRef} />
                                        </>
                                    )}
                                </div>

                                {/* Input */}
                                <div className="p-4 bg-white/5 border-t border-white/10">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder="Ask AI to add tasks..."
                                            disabled={isLoading || loadingHistory}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all disabled:opacity-50"
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={isLoading || !input.trim() || loadingHistory}
                                            className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white transition-colors shadow-lg shadow-purple-900/20"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsOpen(!isOpen)}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 rounded-full shadow-2xl shadow-purple-900/30 text-white border border-white/20 group relative"
                >
                    {isOpen ? (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    ) : (
                        <>
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0f172a]" />
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                        </>
                    )}
                </motion.button>
            </div>
        </div>
    )
}
