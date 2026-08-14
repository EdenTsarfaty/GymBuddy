import { useEffect, useRef, useState } from 'react'
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
import StopwatchIcon from './icons/StopwatchIcon'
import CompleteIcon from './icons/CompleteIcon'
import UncompleteIcon from './icons/UncompleteIcon'

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
const MIN_REPS = 1
const MAX_REPS = 50
const MIN_WEIGHT = 0
const MAX_WEIGHT = 200
const WEIGHT_PX_PER_UNIT = 22
const MIN_DURATION = 5
const MAX_DURATION = 3600
const DURATION_STEP = 15
const MAX_REVEAL_PX = 96
const COMPLETE_THRESHOLD_PX = 80
const SNAP_NUDGE_PX = 10
const CASCADE_STAGGER_MS = 70
const CASCADE_HOLD_MS = 180

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function WorkoutCard({ exercise, sets, reps, weight, duration, description, bullets, videoId, category, isOffline, pendingFields = [], initiallyExpanded = false, onSave, onSwap, onChat, onOpenTimer, completed = false, onToggleComplete, cascadeToken = 0, cascadeIndex = 0 }) {
  const hasDuration = duration !== null && duration !== undefined
  const hasSets = sets > 0
  const hasReps = reps > 0
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [editing, setEditing] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [draftSets, setDraftSets] = useState(sets)
  const [draftReps, setDraftReps] = useState(reps ?? MIN_REPS)
  const [draftWeight, setDraftWeight] = useState(Math.round(weight ?? 0))
  const [draftDuration, setDraftDuration] = useState(duration ?? MIN_DURATION)
  const [weightDragPx, setWeightDragPx] = useState(0)
  const [isDraggingWeight, setIsDraggingWeight] = useState(false)
  const weightDragRef = useRef(null)
  const [dragPx, setDragPx] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const swipeDragRef = useRef(null)

  function toggleExpanded() {
    if (editing) return
    setExpanded((current) => !current)
  }

  function startEditing() {
    setDraftSets(sets)
    setDraftReps(reps ?? MIN_REPS)
    setDraftWeight(Math.round(weight ?? 0))
    setDraftDuration(duration ?? MIN_DURATION)
    setEditing(true)
  }

  function confirmEditing() {
    const updates = hasDuration
      ? { sets: draftSets, reps: null, weight: null, duration: draftDuration }
      : { sets: draftSets, reps: draftReps, weight: draftWeight, duration: null }
    const changedFields = []
    if (draftSets !== sets) changedFields.push('sets')
    if (!hasDuration && draftReps !== reps) changedFields.push('reps')
    if (hasDuration ? draftDuration !== duration : draftWeight !== weight) {
      changedFields.push(hasDuration ? 'duration' : 'weight')
    }
    onSave(updates, changedFields)
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

  function handleSwipePointerDown(e) {
    if (editing) return
    // Not captured yet — just watching. Capturing immediately would retarget the
    // click event to this wrapper on every plain tap (e.g. the expand button),
    // since that's how setPointerCapture works, silently swallowing the click.
    swipeDragRef.current = { startX: e.clientX, captured: false, committed: false, pointerId: e.pointerId }
  }

  function handleSwipePointerMove(e) {
    const drag = swipeDragRef.current
    if (!drag) return
    const delta = e.clientX - drag.startX

    if (!drag.captured) {
      // Only commit to a swipe (and start stealing the gesture) once the drag
      // is clearly horizontal — a plain tap never crosses this and passes
      // through to whatever was tapped, untouched.
      if (Math.abs(delta) < 8) return
      drag.captured = true
      setIsSwiping(true)
      e.currentTarget.setPointerCapture(drag.pointerId)
    }

    // Only rightward drag does anything for now — a future left-swipe action
    // would extend this to a negative range plus its own reveal panel.
    const raw = Math.max(0, Math.min(delta, MAX_REVEAL_PX))
    const pastThreshold = raw >= COMPLETE_THRESHOLD_PX

    // A small detent, not a full lock: crossing the threshold nudges it forward
    // a few extra pixels (a quick "caught" bump) rather than snapping all the way
    // open — dragging further still keeps working normally from there, up to the
    // cap. Crossing back the other way un-nudges. Either transition buzzes once.
    if (pastThreshold !== drag.committed) {
      drag.committed = pastThreshold
      navigator.vibrate?.(15)
    }
    const nudged = drag.committed ? Math.min(raw + SNAP_NUDGE_PX, MAX_REVEAL_PX) : raw
    setDragPx(nudged)
  }

  function handleSwipePointerUp(e) {
    const drag = swipeDragRef.current
    if (!drag) return
    swipeDragRef.current = null
    setIsSwiping(false)
    if (drag.captured && drag.committed) onToggleComplete?.()
    setDragPx(0)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  // "Complete Workout" replays this card's own swipe-to-complete animation
  // programmatically — same dragPx/isSwiping state a real swipe drives, just
  // scripted instead of following a pointer, staggered by list position for the
  // cascading wave. Skips cards already completed (nothing to animate, and
  // onToggleComplete would incorrectly un-complete them).
  useEffect(() => {
    if (!cascadeToken || completed) return

    let holdTimer
    const startTimer = setTimeout(() => {
      setIsSwiping(true)
      setDragPx(Math.min(COMPLETE_THRESHOLD_PX + SNAP_NUDGE_PX, MAX_REVEAL_PX))
      navigator.vibrate?.(15)
      holdTimer = setTimeout(() => {
        onToggleComplete?.()
        setDragPx(0)
        setIsSwiping(false)
      }, CASCADE_HOLD_MS)
    }, cascadeIndex * CASCADE_STAGGER_MS)

    return () => {
      clearTimeout(startTimer)
      clearTimeout(holdTimer)
    }
    // Only a new cascadeToken (a fresh "Complete Workout" press) should start this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cascadeToken])

  return (
    <div
      className="workout-card-swipe"
      onPointerDown={handleSwipePointerDown}
      onPointerMove={handleSwipePointerMove}
      onPointerUp={handleSwipePointerUp}
      onPointerCancel={handleSwipePointerUp}
    >
      <div className="workout-card-swipe-reveal" style={{ opacity: dragPx / MAX_REVEAL_PX }}>
        {completed ? <UncompleteIcon size={28} /> : <CompleteIcon size={28} />}
      </div>
      <div
        className={`workout-card ${completed ? 'is-completed' : ''} ${isSwiping ? 'is-dragging' : ''}`}
        style={{ '--drag-x': `${dragPx}px` }}
      >
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
                  <span className={`stat-value ${pendingFields.includes('sets') ? 'is-pending' : ''}`} title={pendingFields.includes('sets') ? 'Pending sync' : undefined}>{sets}</span>
                </div>
              )}
              {hasReps && (
                <div className="stat">
                  <span className="stat-label">Reps</span>
                  <span className={`stat-value reps-value ${pendingFields.includes('reps') ? 'is-pending' : ''}`} title={pendingFields.includes('reps') ? 'Pending sync' : undefined}>{reps}</span>
                </div>
              )}
              {hasDuration ? (
                <div className="stat">
                  <span className="stat-label">Duration</span>
                  <span className={`stat-value ${pendingFields.includes('duration') ? 'is-pending' : ''}`} title={pendingFields.includes('duration') ? 'Pending sync' : undefined}>{formatDuration(duration)}</span>
                </div>
              ) : weight != null ? (
                <div className="stat">
                  <span className="stat-label">Weight</span>
                  <span className={`stat-value ${pendingFields.includes('weight') ? 'is-pending' : ''}`} title={pendingFields.includes('weight') ? 'Pending sync' : undefined}>{Math.round(weight)} kg</span>
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

              {!hasDuration && (
                <div className="edit-field">
                  <span className="stat-label">Reps</span>
                  <div className="sets-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setDraftReps((current) => Math.max(MIN_REPS, current - 1))}
                      aria-label="Decrease reps"
                    >
                      <ChevronDownIcon size={14} />
                    </button>
                    <span className="stepper-value">{draftReps}</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setDraftReps((current) => Math.min(MAX_REPS, current + 1))}
                      aria-label="Increase reps"
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
                  disabled={isOffline}
                  title={isOffline ? 'Unavailable offline' : undefined}
                  onClick={() => setSwapOpen(true)}
                >
                  <SwapIcon size={16} />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Chat about this exercise"
                    onClick={() => onChat?.()}
                  >
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
                  {hasDuration && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Open timer"
                      onClick={() => onOpenTimer?.()}
                    >
                      <StopwatchIcon size={16} />
                    </button>
                  )}
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
    </div>
  )
}

export default WorkoutCard
