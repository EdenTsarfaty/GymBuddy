import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import lottie from 'lottie-web'
import loadingDark from '../assets/loading_dark.json'
import ChatIcon from './icons/ChatIcon'
import CheckIcon from './icons/CheckIcon'
import ChevronDownIcon from './icons/ChevronDownIcon'
import ChevronUpIcon from './icons/ChevronUpIcon'
import CircleSlashIcon from './icons/CircleSlashIcon'
import PencilIcon from './icons/PencilIcon'
import SwapIcon from './icons/SwapIcon'
import YouTubeIcon from './icons/YouTubeIcon'


function hexToNormalized(hex) {
  const h = hex.replace('#', '').trim()
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255]
}

function recolorLottie(data, accentHex) {
  const [r, g, b] = hexToNormalized(accentHex)
  const clone = JSON.parse(JSON.stringify(data))
  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) { obj.forEach(traverse); return }
    if (obj.ty === 'fl' && Array.isArray(obj.c?.k)) obj.c.k = [r, g, b, 1]
    if (obj.ty === 'st' && Array.isArray(obj.c?.k)) obj.c.k = [r, g, b, 1]
    if (obj.nm === 'Map White To' && Array.isArray(obj.v?.k)) obj.v.k = [r, g, b, 1]
    Object.values(obj).forEach(traverse)
  }
  traverse(clone)
  return clone
}

function LottiePlayer() {
  const ref = useRef(null)
  useEffect(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const anim = lottie.loadAnimation({
      container: ref.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: recolorLottie(loadingDark, accent),
    })
    return () => anim.destroy()
  }, [])
  return <div ref={ref} style={{ width: 210, height: 210 }} />
}

const SWAP_REASONS = [
  { id: 'hurts', label: 'This exercise hurts' },
  { id: 'new', label: 'I want a new exercise' },
  { id: 'unavailable', label: 'This exercise is unavailable in my gym' },
  { id: 'other', label: 'Other' },
]

function SwapExerciseModal({ exerciseName, onClose, onConfirm }) {
  const [reason, setReason] = useState(null)
  const [otherText, setOtherText] = useState('')
  const [loading, setLoading] = useState(false)

  const canConfirm = reason && (reason !== 'other' || otherText.trim())

  async function handleConfirm() {
    if (!canConfirm) return
    setLoading(true)
    await onConfirm(reason, otherText)
  }

  return createPortal(
    <div className="modal-overlay">
      {loading ? (
        <LottiePlayer />
      ) : (
        <div className="modal-wrap">
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
          <div className="modal-box swap-modal">
            <div className="swap-modal-top">
              <div className="swap-modal-header">
                <h2 className="swap-modal-title">Swap Exercise</h2>
                <span className="swap-modal-subtitle">{exerciseName}</span>
              </div>
              <div className="swap-radios">
                {SWAP_REASONS.map(({ id, label }) => (
                  <label key={id} className={`swap-radio-option ${reason === id ? 'is-checked' : ''}`}>
                    <input
                      type="radio"
                      name="swap-reason"
                      value={id}
                      checked={reason === id}
                      onChange={() => setReason(id)}
                      className="swap-radio-input"
                    />
                    <span className="swap-radio-box" />
                    <span className="swap-radio-label">{label}</span>
                  </label>
                ))}
                {reason === 'other' && (
                  <textarea
                    className="swap-other-textarea"
                    placeholder="Describe your reason..."
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    autoFocus
                  />
                )}
              </div>
            </div>
            <button
              type="button"
              className="swap-confirm-btn"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              Swap
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

const MIN_SETS = 1
const MAX_SETS = 10
const MIN_WEIGHT = 0
const MAX_WEIGHT = 200
const WEIGHT_PX_PER_UNIT = 22

function WorkoutCard({ exercise, sets, weight, description, bullets, videoId, onSave, onSwap }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [draftSets, setDraftSets] = useState(sets)
  const [draftWeight, setDraftWeight] = useState(weight)
  const [weightDragPx, setWeightDragPx] = useState(0)
  const [isDraggingWeight, setIsDraggingWeight] = useState(false)
  const weightDragRef = useRef(null)

  function toggleExpanded() {
    if (editing) return
    setExpanded((current) => !current)
  }

  function startEditing() {
    setDraftSets(sets)
    setDraftWeight(weight)
    setEditing(true)
  }

  function confirmEditing() {
    onSave({ sets: draftSets, weight: draftWeight })
    setEditing(false)
  }

  function cancelEditing() {
    setEditing(false)
  }

  function handleWeightPointerDown(e) {
    weightDragRef.current = { startX: e.clientX, startValue: draftWeight }
    setIsDraggingWeight(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleWeightPointerMove(e) {
    if (!weightDragRef.current) return
    const delta = e.clientX - weightDragRef.current.startX
    const unitDelta = Math.round(delta / WEIGHT_PX_PER_UNIT)
    const next = Math.min(
      MAX_WEIGHT,
      Math.max(MIN_WEIGHT, weightDragRef.current.startValue - unitDelta),
    )
    setDraftWeight(next)
    setWeightDragPx(delta - unitDelta * WEIGHT_PX_PER_UNIT)
  }

  function handleWeightPointerUp(e) {
    weightDragRef.current = null
    setIsDraggingWeight(false)
    setWeightDragPx(0)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div className="workout-card">
      <div className="workout-card-main">
        <h3 className="workout-card-title">{exercise}</h3>

        <div className="workout-card-main-right">
          {!editing ? (
            <div className="workout-card-right">
              <div className="stat">
                <span className="stat-label">Sets</span>
                <span className="stat-value">{sets}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Weight</span>
                <span className="stat-value">{weight} kg</span>
              </div>
            </div>
          ) : (
            <div className="workout-card-edit">
              <div className="edit-field">
                <span className="stat-label">Sets</span>
                <div className="sets-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => setDraftSets((current) => Math.max(MIN_SETS, current - 1))}
                    aria-label="Decrease sets"
                  >
                    <ChevronDownIcon size={14} />
                  </button>
                  <span className="stepper-value">{draftSets}</span>
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => setDraftSets((current) => Math.min(MAX_SETS, current + 1))}
                    aria-label="Increase sets"
                  >
                    <ChevronUpIcon size={14} />
                  </button>
                </div>
              </div>

              <div className="edit-field">
                <span className="stat-label">Weight (kg)</span>
                <div
                  className="weight-picker"
                  onPointerDown={handleWeightPointerDown}
                  onPointerMove={handleWeightPointerMove}
                  onPointerUp={handleWeightPointerUp}
                  onPointerCancel={handleWeightPointerUp}
                >
                  <div
                    className={`weight-picker-track ${isDraggingWeight ? 'is-dragging' : ''}`}
                    style={{ transform: `translateX(${weightDragPx}px)` }}
                  >
                    <span className="weight-picker-num">{Math.max(MIN_WEIGHT, draftWeight - 1)}</span>
                    <span className="weight-picker-num current">{draftWeight}</span>
                    <span className="weight-picker-num">{Math.min(MAX_WEIGHT, draftWeight + 1)}</span>
                  </div>
                </div>
              </div>

              <div className="edit-confirm-actions">
                <button
                  type="button"
                  className="icon-btn confirm-btn"
                  onClick={confirmEditing}
                  aria-label="Save changes"
                >
                  <CheckIcon size={16} />
                </button>
              </div>
            </div>
          )}

          {!editing && (
            <button
              type="button"
              className={`expand-btn ${expanded ? 'is-open' : ''}`}
              onClick={toggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse details' : 'Expand details'}
            >
              <ChevronDownIcon size={18} />
            </button>
          )}
        </div>
      </div>

      <div className={`details-collapse ${expanded ? 'is-open' : ''}`}>
        <div className="details-collapse-inner" inert={!expanded}>
          <div className="workout-card-details">
            <div className="workout-card-info">
              <p className="workout-card-description">{description}</p>
              <ul className="instruction-bullets">
                {bullets.map((bullet) => (
                  <li key={bullet}>
                    <span className="bullet-marker" aria-hidden="true" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>

            <div className="workout-card-actions">
              {!editing ? (
                <button type="button" className="icon-btn" onClick={startEditing} aria-label="Edit exercise">
                  <PencilIcon size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn cancel-btn"
                  onClick={cancelEditing}
                  aria-label="Cancel editing"
                >
                  <CircleSlashIcon size={16} />
                </button>
              )}
              {editing ? (
                <button
                  type="button"
                  className="icon-btn swap-btn"
                  aria-label="Ask AI to swap this exercise"
                  onClick={() => setSwapOpen(true)}
                >
                  <SwapIcon size={16} />
                </button>
              ) : (
                <>
                  <button type="button" className="icon-btn" aria-label="Chat about this exercise">
                    <ChatIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Watch on YouTube"
                    disabled={!videoId}
                    onClick={() => videoId && window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')}
                  >
                    <YouTubeIcon size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {swapOpen && (
        <SwapExerciseModal
          exerciseName={exercise}
          onClose={() => setSwapOpen(false)}
          onConfirm={async (reason, otherText) => {
            await onSwap?.(reason, otherText)
            setSwapOpen(false)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

export default WorkoutCard
