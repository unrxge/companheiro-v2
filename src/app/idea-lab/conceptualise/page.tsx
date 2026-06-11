'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const PHASE_LABELS: Record<number, string> = {
  1: 'First Contact',
  2: 'Excavation',
  3: 'Challenge',
  4: 'Clarification',
  5: 'Declaration',
}

function ConceptualiseContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const seed = searchParams.get('seed')

  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [phase, setPhase] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readyToAdvance, setReadyToAdvance] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Initialize with seed or fetch initial AI message
  useEffect(() => {
    const initializeConversation = async () => {
      if (seed) {
        // Start with seed as first user message
        const seedMessage: Message = { role: 'user', content: seed }
        setMessages([seedMessage])
        // Get initial AI response
        await fetchAIResponse([seedMessage], 1)
      } else {
        // Start from scratch - get initial AI message
        const initialMessages: Message[] = []
        await fetchAIResponse(initialMessages, 1)
      }
    }

    initializeConversation()
  }, [seed])

  // Scroll to bottom of thread
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages])

  const fetchAIResponse = async (conversationHistory: Message[], currentPhase: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/idea-lab/conceptualise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          phase: currentPhase,
          seed: seed || undefined,
        }),
      })

      const data = await res.json()

      if (!data.response) {
        setError('Failed to get response')
        return
      }

      const updatedMessages: Message[] = [
        ...conversationHistory,
        { role: 'assistant', content: data.response },
      ]
      setMessages(updatedMessages)
      setPhase(data.phase)
      setReadyToAdvance(data.readyToAdvance)
    } catch (err) {
      console.error('Conceptualise error:', err)
      setError('Failed to get response. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const startRecording = async () => {
    setError(null)

    const SpeechRecognitionAPI =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionAPI) {
      setError('Speech recognition not supported in your browser')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionAPI()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsRecording(true)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i][0].isFinal) {
          setInputText((prev) => prev + transcript + ' ')
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setError(`Error: ${event.error}`)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: inputText.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInputText('')

    await fetchAIResponse(updatedMessages, phase)
  }

  const handleDeclare = () => {
    // Store conversation in sessionStorage and navigate to core concept
    console.log('Storing conversation:', messages)
    sessionStorage.setItem('conceptualisation_conversation', JSON.stringify(messages))
    router.push('/idea-lab/core-concept')
  }

  return (
    <div className="flex h-screen flex-col bg-[#111110]">
      {/* Phase indicator */}
      <div className="px-6 py-4 border-b border-[#1f1f1d] flex justify-between items-center gap-4">
        <button
          onClick={() => router.push('/idea-lab')}
          className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors whitespace-nowrap"
        >
          ← Idea Lab
        </button>
        <p className="text-xs text-[#4a4946] uppercase tracking-widest flex-1 text-center">
          Phase {phase}: {PHASE_LABELS[phase]}
        </p>
        {readyToAdvance && phase === 5 && (
          <button
            onClick={handleDeclare}
            className="px-3 py-1.5 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors"
          >
            Declare this idea
          </button>
        )}
      </div>

      {/* Message thread */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
      >
        <div className="max-w-2xl mx-auto w-full space-y-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-4 py-3 rounded ${
                  msg.role === 'user'
                    ? 'bg-[#e8e6e1] text-[#111110]'
                    : 'bg-[#161614] border border-[#1f1f1d] text-[#d4d2cd]'
                }`}
              >
                <p className={`text-sm leading-relaxed ${msg.role === 'user' ? 'font-medium' : 'font-normal'}`}>
                  {msg.content}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#161614] border border-[#1f1f1d] text-[#4a4946] px-4 py-3 rounded text-sm">
                ...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-900/20 border-t border-red-700/30">
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      {/* Input area */}
      <div className="px-6 py-6 border-t border-[#1f1f1d] bg-[#111110]">
        <div className="max-w-2xl mx-auto w-full space-y-3">
          <div className="flex gap-3">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && inputText.trim() && !isLoading) {
                  handleSend()
                }
              }}
              placeholder="Share your thought..."
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-[#1c1c1a] border border-[#2e2d2a] rounded px-4 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
              style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
            />

            <button
              onClick={handleRecordToggle}
              disabled={isLoading}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`
                w-10 h-10 rounded transition-all duration-300 flex items-center justify-center flex-shrink-0
                ${isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                ${isRecording
                  ? 'bg-[#e8e6e1]'
                  : 'bg-[#1c1c1a] border border-[#2e2d2a] hover:border-[#4a4946]'
                }
              `}
            >
              {isRecording ? (
                <span className="block w-2.5 h-2.5 bg-[#111110] rounded-sm" />
              ) : (
                <span className="block w-2.5 h-2.5 bg-[#3d3c39] rounded-full" />
              )}
            </button>

            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="px-4 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
            >
              Send
            </button>
          </div>

          {isRecording && (
            <p className="text-xs text-[#4a4946] text-center tracking-widest uppercase">Recording</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ConceptualisePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#111110] flex items-center justify-center"><p className="text-[#4a4946]">Loading...</p></div>}>
      <ConceptualiseContent />
    </Suspense>
  )
}
