import { useEffect, useRef, useState } from 'react'
import SendIcon from './icons/SendIcon'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

const SUGGESTED_QUESTIONS = [
  'Which muscles should I feel this in?',
  'How do I make this harder?',
  'How do I make this easier?',
  'I feel pain during this — is that normal?',
  "What's a common mistake here?",
  'How should I breathe during this?',
  'Is there an easier alternative?',
  'Why is this in my plan?',
  'How do I know my form is right?',
  "What's a good warm-up for this?",
]

function ChatView({ exercise, isOffline }) {
  const [messages, setMessages] = useState(() => [
    {
      id: 'seed-1',
      role: 'assistant',
      text: `Ask me anything about ${exercise?.name || 'this exercise'} — form cues, alternatives, or why it's in your plan.`,
    },
  ])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [placeholder] = useState(() => SUGGESTED_QUESTIONS[Math.floor(Math.random() * SUGGESTED_QUESTIONS.length)])
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const listRef = useRef(null)

  function updateScrollUI() {
    const el = listRef.current
    if (!el) return
    setShowTopFade(el.scrollTop > 4)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }

  useEffect(() => {
    if (!exercise?.id) return
    fetch(`${API_BASE}/api/exercises/${exercise.id}/chat`)
      .then((res) => (res.ok ? res.json() : []))
      .then((history) => {
        if (history.length > 0) {
          setMessages(history.map((m) => ({ id: m.id, role: m.role, text: m.text })))
        }
      })
      .catch(() => {})
  }, [exercise?.id])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    updateScrollUI()
  }, [messages, thinking])

  function sendMessage(text) {
    const trimmed = (text ?? draft).trim()
    if (!trimmed || thinking || isOffline || !exercise?.id) return

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: trimmed }])
    setDraft('')
    setThinking(true)

    const minDelay = new Promise((resolve) => setTimeout(resolve, 600))
    const request = fetch(`${API_BASE}/api/exercises/${exercise.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
    }).then((res) => (res.ok ? res.json() : null))

    Promise.all([request, minDelay])
      .then(([data]) => {
        if (data?.assistantMessage) {
          setMessages((current) => [
            ...current,
            { id: data.assistantMessage.id, role: 'assistant', text: data.assistantMessage.text },
          ])
          // Refresh the cached GET history so it's up to date for offline viewing later —
          // the POST response alone doesn't update the service worker's cached copy of it.
          fetch(`${API_BASE}/api/exercises/${exercise.id}/chat`).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setThinking(false))
  }

  return (
    <div className="chat-view">
      <div className="chat-messages-wrap">
        <div className="chat-messages" ref={listRef} onScroll={updateScrollUI}>
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
              {message.text}
            </div>
          ))}
          {thinking && (
            <div className="chat-bubble is-assistant chat-typing">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
            </div>
          )}
        </div>
        <div className={`chat-fade chat-fade-top ${showTopFade ? 'is-visible' : ''}`} />
        <div className={`chat-fade chat-fade-bottom ${showBottomFade ? 'is-visible' : ''}`} />
      </div>

      <div className="chat-input-bar">
        <input
          className="chat-input"
          type="text"
          value={draft}
          placeholder={isOffline ? 'Unavailable offline' : placeholder}
          disabled={isOffline}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendMessage()
          }}
        />
        <button
          type="button"
          className="icon-btn chat-send-btn"
          onClick={() => sendMessage()}
          disabled={isOffline || !draft.trim() || thinking}
          aria-label="Send message"
        >
          <SendIcon size={20} />
        </button>
      </div>
    </div>
  )
}

export default ChatView
