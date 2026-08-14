import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SendIcon from './icons/SendIcon'
import PencilIcon from './icons/PencilIcon'
import SwapIcon from './icons/SwapIcon'
import YouTubeIcon from './icons/YouTubeIcon'
import { API_BASE } from '../apiBase'

const PROPOSAL_ICON = {
  stat_change: PencilIcon,
  swap: SwapIcon,
  video_change: YouTubeIcon,
  watch_video: YouTubeIcon,
}

function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part,
  )
}

function parseFormattedBlocks(text) {
  const blocks = []
  let list = null

  function flushList() {
    if (list) blocks.push(list)
    list = null
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) { flushList(); continue }

    const bullet = line.match(/^[-*]\s+(.*)$/)
    const ordered = line.match(/^\d+\.\s+(.*)$/)

    if (bullet) {
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] } }
      list.items.push(bullet[1])
    } else if (ordered) {
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] } }
      list.items.push(ordered[1])
    } else {
      flushList()
      blocks.push({ type: 'p', text: line })
    }
  }
  flushList()

  return blocks
}

function FormattedMessage({ text }) {
  const blocks = parseFormattedBlocks(text)
  return blocks.map((block, i) => {
    if (block.type === 'p') return <p key={i} className="chat-text-block">{renderInline(block.text)}</p>
    if (block.type === 'ul') {
      return (
        <ul key={i} className="chat-list-block instruction-bullets">
          {block.items.map((item, j) => (
            <li key={j}>
              <span className="bullet-marker" aria-hidden="true" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <ol key={i} className="chat-list-block chat-list-ordered">
        {block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
      </ol>
    )
  })
}

function proposalLabel(proposal, exercise) {
  if (proposal.type === 'swap') return 'Swap exercise'
  if (proposal.type === 'video_change') return 'Change video'
  if (proposal.type === 'watch_video') return 'Watch video'

  const { sets, reps, weight, duration } = proposal.payload || {}
  const parts = []
  if (weight != null && weight !== exercise?.weight) parts.push(`weight ${exercise?.weight ?? '—'} → ${weight} kg`)
  if (reps != null && reps !== exercise?.reps) parts.push(`reps ${exercise?.reps ?? '—'} → ${reps}`)
  if (sets != null && sets !== exercise?.sets) parts.push(`sets ${exercise?.sets ?? '—'} → ${sets}`)
  if (duration != null && duration !== exercise?.duration) parts.push(`duration ${exercise?.duration ?? '—'} → ${duration}s`)

  return parts.length > 0 ? `Change ${parts.join(', ')}` : 'Update exercise'
}

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

function ChatView({ exercise, isOffline, onExerciseUpdated }) {
  const [messages, setMessages] = useState(() => [
    {
      id: 'seed-1',
      role: 'assistant',
      text: `Ask me anything about ${exercise?.name || 'this exercise'} — form cues, alternatives, or why it's in your plan.`,
      proposals: [],
    },
  ])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [placeholder] = useState(() => SUGGESTED_QUESTIONS[Math.floor(Math.random() * SUGGESTED_QUESTIONS.length)])
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)
  const [swapConfirmProposal, setSwapConfirmProposal] = useState(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)

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
          setMessages(history.map((m) => ({ id: m.id, role: m.role, text: m.text, proposals: m.proposals || [] })))
        }
      })
      .catch(() => {})
  }, [exercise?.id])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    updateScrollUI()
  }, [messages, thinking])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  function sendMessage(text) {
    const trimmed = (text ?? draft).trim()
    if (!trimmed || thinking || isOffline || !exercise?.id) return

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: trimmed, proposals: [] }])
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
            { id: data.assistantMessage.id, role: 'assistant', text: data.assistantMessage.text, proposals: data.assistantMessage.proposals || [] },
          ])
          // Refresh the cached GET history so it's up to date for offline viewing later —
          // the POST response alone doesn't update the service worker's cached copy of it.
          fetch(`${API_BASE}/api/exercises/${exercise.id}/chat`).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setThinking(false))
  }

  function applyProposal(proposal) {
    if (!exercise?.id || confirmingId) return
    setConfirmingId(proposal.id)
    setSwapConfirmProposal(null)

    fetch(`${API_BASE}/api/exercises/${exercise.id}/chat/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: proposal.type, payload: proposal.payload }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        const confirmationMessage = {
          id: data.confirmationMessage.id,
          role: 'assistant',
          text: data.confirmationMessage.text,
          proposals: data.confirmationMessage.proposals || [],
        }
        if (data.historyReset) {
          setMessages([confirmationMessage])
        } else {
          setMessages((current) => [...current, confirmationMessage])
        }
        if (data.updatedExercise) onExerciseUpdated?.(data.updatedExercise)
        fetch(`${API_BASE}/api/exercises/${exercise.id}/chat`).catch(() => {})
      })
      .catch(() => {})
      .finally(() => setConfirmingId(null))
  }

  function confirmProposal(proposal) {
    if (proposal.type === 'watch_video') {
      window.open(`https://www.youtube.com/watch?v=${proposal.payload.video_id}`, '_blank')
      return
    }
    if (proposal.type === 'swap') {
      setSwapConfirmProposal(proposal)
      return
    }
    applyProposal(proposal)
  }

  const lastMessage = messages[messages.length - 1]

  return (
    <div className="chat-view">
      <div className="chat-messages-wrap">
        <div className="chat-messages" ref={listRef} onScroll={updateScrollUI}>
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble-group ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
              <div className={`chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                <FormattedMessage text={message.text} />
              </div>
              {message === lastMessage && message.proposals?.length > 0 && (
                <div className="chat-proposal-row">
                  {message.proposals.map((proposal) => {
                    const Icon = PROPOSAL_ICON[proposal.type]
                    return (
                      <button
                        key={proposal.id}
                        type="button"
                        className="chat-proposal-pill"
                        disabled={!!confirmingId}
                        onClick={() => confirmProposal(proposal)}
                      >
                        {Icon && <Icon size={14} />}
                        {confirmingId === proposal.id ? 'Applying…' : proposalLabel(proposal, exercise)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="chat-bubble-group is-assistant">
              <div className="chat-bubble is-assistant chat-typing">
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
              </div>
            </div>
          )}
        </div>
        <div className={`chat-fade chat-fade-top ${showTopFade ? 'is-visible' : ''}`} />
        <div className={`chat-fade chat-fade-bottom ${showBottomFade ? 'is-visible' : ''}`} />
      </div>

      <div className="chat-input-bar">
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          value={draft}
          placeholder={isOffline ? 'Unavailable offline' : placeholder}
          disabled={isOffline}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
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

      {swapConfirmProposal && createPortal(
        <div className="modal-overlay regen-confirm-overlay" onMouseDown={() => setSwapConfirmProposal(null)}>
          <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-box regen-confirm-box">
              <p className="regen-confirm-heading">Swap this exercise?</p>
              <p className="regen-confirm-body">
                This will replace the exercise and clear this chat conversation. This cannot be undone.
              </p>
              <div className="regen-confirm-actions">
                <button className="regen-confirm-cancel" onClick={() => setSwapConfirmProposal(null)}>
                  Cancel
                </button>
                <button className="regen-confirm-ok" onClick={() => applyProposal(swapConfirmProposal)}>
                  Yes, swap it
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default ChatView
