import { useEffect, useRef, useState } from 'react'
import SendIcon from './icons/SendIcon'

const MOCK_REPLIES = [
  "Good question — focus on keeping the movement controlled rather than rushing through reps. Form matters more than speed here.",
  "That depends on how it feels for you. If you're not feeling it in the target muscle, double-check your setup and range of motion first.",
  "A common mistake is letting momentum take over. Slow down the eccentric (lowering) part of the movement for better results.",
  "You could try a lighter weight for a few sessions to really nail the form before adding load back on.",
]

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

function makeMockReply() {
  return MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)]
}

function ChatView({ exercise }) {
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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    updateScrollUI()
  }, [messages, thinking])

  function sendMessage(text) {
    const trimmed = (text ?? draft).trim()
    if (!trimmed || thinking) return

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: trimmed }])
    setDraft('')
    setThinking(true)

    setTimeout(() => {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: makeMockReply() }])
      setThinking(false)
    }, 900)
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
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendMessage()
          }}
        />
        <button
          type="button"
          className="icon-btn chat-send-btn"
          onClick={() => sendMessage()}
          disabled={!draft.trim() || thinking}
          aria-label="Send message"
        >
          <SendIcon size={20} />
        </button>
      </div>
    </div>
  )
}

export default ChatView
