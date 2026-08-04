import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LottiePlayer from './LottiePlayer'
import ChatIcon from './icons/ChatIcon'
import CheckIcon from './icons/CheckIcon'
import ChevronDownIcon from './icons/ChevronDownIcon'
import ChevronUpIcon from './icons/ChevronUpIcon'
import CircleSlashIcon from './icons/CircleSlashIcon'
import DumbbellIcon from './icons/DumbbellIcon'
import MachineIcon from './icons/MachineIcon'
import PencilIcon from './icons/PencilIcon'
import StretchIcon from './icons/StretchIcon'
import SwapIcon from './icons/SwapIcon'
import TreadmillIcon from './icons/TreadmillIcon'
import PlankIcon from './icons/PlankIcon'
import YouTubeIcon from './icons/YouTubeIcon'

const CATEGORY_META = {
  free_weight:  { label: 'Free weight',  Icon: DumbbellIcon },
  machine:      { label: 'Machine',      Icon: MachineIcon },
  body_weight:  { label: 'Body weight',  Icon: PlankIcon },
  warm_up:      { label: 'Warm up',      Icon: TreadmillIcon },
  stretch:      { label: 'Stretch',      Icon: StretchIcon },
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
        <div className="swap-loading">
          <LottiePlayer />
        </div>
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
const MIN_DURATION = 5
const MAX_DURATION = 3600
const DURATION_STEP = 15

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function WorkoutCard({ exercise, sets, weight, duration, description, bullets, videoId, category, onSave, onSwap }) {
  const hasDuration = duration !== null && duration !== undefined
  const hasSets = sets > 0
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [draftSets, setDraftSets] = useState(sets)
  const [draftWeight, setDraftWeight] = useState(Math.round(weight ?? 0))
  const [draftDuration, setDraftDuration] = useState(duration ?? MIN_DURATION)
  const [weightDragPx, setWeightDragPx] = useState(0)
  const [isDraggingWeight, setIsDraggingWeight] = useState(false)
  const weightDragRef = useRef(null)

  function toggleExpanded() {
    if (editing) return
    setExpanded((current) => !current)
  }

  function startEditing() {
    setDraftSets(sets)
    setDraftWeight(Math.round(weight ?? 0))
    setDraftDuration(duration ?? MIN_DURATION)
    setEditing(true)
  }

  function confirmEditing() {
    onSave(hasDuration
      ? { sets: draftSets, weight: null, duration: draftDuration }
      : { sets: draftSets, weight: draftWeight, duration: null }
    )
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
        <h3
          className="workout-card-title"
          style={{ '--title-len': exercise.length }}
        >{exercise}</h3>

        <div className="workout-card-main-right">
          {!editing ? (
            <div className="workout-card-right">
              {hasSets && (
                <div className="stat">
                  <span className="stat-label">Sets</span>
                  <span className="stat-value">{sets}</span>
                </div>
              )}
              {hasDuration ? (
                <div className="stat">
                  <span className="stat-label">Duration</span>
                  <span className="stat-value">{formatDuration(duration)}</span>
                </div>
              ) : weight != null ? (
                <div className="stat">
                  <span className="stat-label">Weight</span>
                  <span className="stat-value">{Math.round(weight)} kg</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="workout-card-edit">
              {hasSets && (
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
              )}

              {hasDuration ? (
                <div className="edit-field">
                  <span className="stat-label">Duration</span>
                  <div className="sets-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setDraftDuration((v) => Math.max(MIN_DURATION, v - DURATION_STEP))}
                      aria-label="Decrease duration"
                    >
                      <ChevronDownIcon size={14} />
                    </button>
                    <span className="stepper-value">{formatDuration(draftDuration)}</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setDraftDuration((v) => Math.min(MAX_DURATION, v + DURATION_STEP))}
                      aria-label="Increase duration"
                    >
                      <ChevronUpIcon size={14} />
                    </button>
                  </div>
                </div>
              ) : (
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
              )}

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
              {category && CATEGORY_META[category] && (() => {
                const { label, Icon } = CATEGORY_META[category]
                return (
                  <div className="exercise-category">
                    <Icon size={25} />
                    <span>{label}</span>
                  </div>
                )
              })()}
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
