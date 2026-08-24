import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE } from '../apiBase'
import LottiePlayer from './LottiePlayer'
import MuscleDiagram from './MuscleDiagram'
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
import MuscleIcon from './icons/MuscleIcon'
import StopwatchIcon from './icons/StopwatchIcon'
import CompleteIcon from './icons/CompleteIcon'
import UncompleteIcon from './icons/UncompleteIcon'
import XIcon from './icons/XIcon'

const CATEGORY_META = {
  free_weight:  { label: 'Free weight',  Icon: DumbbellIcon },
  machine:      { label: 'Machine',      Icon: MachineIcon },
  body_weight:  { label: 'Body weight',  Icon: PlankIcon },
  warm_up:      { label: 'Warm up',      Icon: TreadmillIcon },
  stretch:      { label: 'Stretch',      Icon: StretchIcon },
}



const SWAP_REASONS = [
  { id: 'hurts', label: 'This exercise hurts' },
  { id: 'unavailable', label: 'This exercise is unavailable in my gym' },
  { id: 'new', label: 'I want a new exercise' },
  { id: 'dislike', label: "I don't like this exercise" },
]

function SwapExerciseModal({ exerciseName, onClose, onConfirm }) {
  const [reason, setReason] = useState(null)
  const [addDetails, setAddDetails] = useState(false)
  const [otherText, setOtherText] = useState('')
  const [loading, setLoading] = useState(false)

  const canConfirm = reason && (!addDetails || otherText.trim())

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
                <label className={`swap-radio-option swap-details-option ${addDetails ? 'is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={addDetails}
                    onChange={(e) => setAddDetails(e.target.checked)}
                    className="swap-radio-input"
                  />
                  <span className="swap-checkbox-box" />
                  <span className="swap-radio-label">Add details</span>
                </label>
                {addDetails && (
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

function AdjustmentAddRow({ onClick }) {
  return (
    <button type="button" className="adjustment-add-row" onClick={onClick} aria-label="Add adjustment note">
      <svg width="30" height="30" viewBox="2 7 28 18" className="adjustment-pin-icon" aria-hidden="true">
        <g transform="rotate(-90 16 16.25)">
          <path d="m12.15002,20.20996c1.88995,2.97003,2.84998,6.01001,2.84998,9.04004,0,.56.45001,1,1,1s1-.44,1-1c0-3.03003.96002-6.07001,2.84998-9.04004.62-.98999,1.47003-1.81,2.14001-2.41998,1.87-1.69,2.94-4.09998,2.94-6.60999,0-4.91998-4.01001-8.92999-8.92999-8.92999S7.07001,6.26001,7.07001,11.17999c0,2.51001,1.07001,4.91998,2.94,6.60999.66998.60999,1.52002,1.42999,2.14001,2.41998Z" />
          <line x1="16" y1="8.15" x2="16" y2="14.21" strokeLinecap="round" />
          <line x1="12.97" y1="11.18" x2="19.03" y2="11.18" strokeLinecap="round" />
        </g>
      </svg>
      <span className="adjustment-add-line" aria-hidden="true" />
    </button>
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
const MAX_REVEAL_PX = 96
const COMPLETE_THRESHOLD_PX = 80
const SNAP_NUDGE_PX = 10
const CASCADE_STAGGER_MS = 70
const CASCADE_HOLD_MS = 180

function durationStepFor(seconds) {
  if (seconds < 60) return 5
  if (seconds < 120) return 10
  if (seconds < 360) return 15
  return 30
}

// "lower-back" -> "Lower back" — matches how MuscleDiagram's slugs
// (see MUSCLE_GROUPS in backend/src/openai.js) read as plain English.
function formatMuscleName(slug) {
  const spaced = slug.replace(/-/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function WorkoutCard({ exercise, sets, reps, weight, duration, description, bullets, adjustments = [], videoId, category, photo, muscles = [], sex, isOffline, pendingFields = [], initiallyExpanded = false, onSave, onSwap, onChat, onOpenTimer, completed = false, onToggleComplete, cascadeToken = 0, cascadeIndex = 0, isReverting = false }) {
  const hasDuration = duration !== null && duration !== undefined
  const hasSets = sets > 0
  const hasReps = reps > 0
  const photoUrl = photo ? (photo.startsWith('https://') ? photo : `${API_BASE}/api/exercise-photos/${photo}`) : null
  const [photoFailed, setPhotoFailed] = useState(false)
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [showMuscles, setShowMuscles] = useState(false)
  const photoExpandActive = expanded && !!photoUrl && !photoFailed
  const isGifPhoto = !!photoUrl && /\.gif(\?|$)/i.test(photoUrl)
  const [gifStaticFrame, setGifStaticFrame] = useState(null)

  // GIFs animate regardless of display size, so a collapsed thumbnail would
  // otherwise keep playing in the background. Snapshot the frame it loads
  // on to a canvas and show that still frame while collapsed — swap back to
  // the live animated src only once the card is expanded.
  useEffect(() => {
    if (!isGifPhoto || !photoUrl) { setGifStaticFrame(null); return }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        setGifStaticFrame(canvas.toDataURL())
      } catch {
        // Tainted canvas (e.g. an external URL without permissive CORS) —
        // fall back to always showing the live gif rather than breaking.
        setGifStaticFrame(null)
      }
    }
    img.src = photoUrl
    return () => { cancelled = true }
  }, [photoUrl, isGifPhoto])

  const displayedPhotoSrc = isGifPhoto && !photoExpandActive && gifStaticFrame ? gifStaticFrame : photoUrl
  const statsRef = useRef(null)
  const statsFlipRectRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [draftSets, setDraftSets] = useState(sets)
  const [draftReps, setDraftReps] = useState(reps ?? MIN_REPS)
  const [draftWeight, setDraftWeight] = useState(Math.round(weight ?? 0))
  const [draftDuration, setDraftDuration] = useState(duration ?? MIN_DURATION)
  const [draftAdjustments, setDraftAdjustments] = useState(adjustments)
  const [weightDragPx, setWeightDragPx] = useState(0)
  const [isDraggingWeight, setIsDraggingWeight] = useState(false)
  const weightDragRef = useRef(null)
  const [dragPx, setDragPx] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const swipeDragRef = useRef(null)
  const newAdjustmentRef = useRef(null)
  const justAddedAdjustmentRef = useRef(false)

  function toggleExpanded() {
    if (editing) return
    // Only relevant when a photo is present — that's the only case where
    // expanding actually moves the stats (row -> stacked column). The title
    // doesn't need this: it's naturally carried along smoothly by the
    // image's own width/height transition reflowing the row underneath it.
    if (photoUrl && !photoFailed && statsRef.current) {
      statsFlipRectRef.current = statsRef.current.getBoundingClientRect()
    }
    setExpanded((current) => !current)
  }

  // FLIP for the stats block's reflow (row -> stacked column) — a
  // flex-direction change isn't something a plain CSS transition can
  // interpolate, so this measures the gap between its pre-toggle rect
  // (captured above) and where it actually landed, and plays that
  // difference backwards. Duration/easing intentionally match the photo
  // thumbnail's own width/height transition (see .workout-card-photo-thumb)
  // so both finish together instead of the front-loaded easing here making
  // this one visually stop before the resize does. useLayoutEffect (not
  // useEffect) so the inverted starting position is set before the browser
  // ever paints the new layout.
  useLayoutEffect(() => {
    const startRect = statsFlipRectRef.current
    const el = statsRef.current
    statsFlipRectRef.current = null
    if (!startRect || !el) return

    const endRect = el.getBoundingClientRect()
    const translateX = startRect.left - endRect.left
    const translateY = startRect.top - endRect.top
    if (translateX === 0 && translateY === 0) return

    el.style.transition = 'none'
    el.style.transform = `translate(${translateX}px, ${translateY}px)`
    void el.offsetWidth
    requestAnimationFrame(() => {
      el.style.transition = 'transform 0.35s cubic-bezier(0.3, 0, 0.2, 1)'
      el.style.transform = 'translate(0, 0)'
    })
  }, [expanded])

  function addAdjustmentField() {
    justAddedAdjustmentRef.current = true
    setDraftAdjustments((current) => [...current, { label: '', value: '' }])
  }

  // Focus the newest pair's label field once it's actually in the DOM —
  // guarded so entering edit mode (which also changes draftAdjustments.length,
  // from [] to any existing notes) doesn't itself steal focus.
  useEffect(() => {
    if (!justAddedAdjustmentRef.current) return
    justAddedAdjustmentRef.current = false
    newAdjustmentRef.current?.focus()
  }, [draftAdjustments.length])

  function updateAdjustment(index, field, text) {
    setDraftAdjustments((current) => current.map((a, i) => (i === index ? { ...a, [field]: text } : a)))
  }

  function removeAdjustment(index) {
    setDraftAdjustments((current) => {
      const next = current.filter((_, i) => i !== index)
      // Never leave the editor with zero visible fields — same reasoning as
      // starting edit mode with none: an empty pair keeps the feature visible.
      return next.length > 0 ? next : [{ label: '', value: '' }]
    })
  }

  function startEditing() {
    setDraftSets(sets)
    setDraftReps(reps ?? MIN_REPS)
    setDraftWeight(Math.round(weight ?? 0))
    setDraftDuration(duration ?? MIN_DURATION)
    // Show one empty pair by default when there are no saved adjustments yet —
    // makes the feature discoverable instead of hiding behind the + button.
    setDraftAdjustments(adjustments.length > 0 ? adjustments : [{ label: '', value: '' }])
    setEditing(true)
  }

  function confirmEditing() {
    const cleanedAdjustments = draftAdjustments
      .map((a) => ({ label: a.label.trim(), value: a.value.trim() }))
      .filter((a) => a.label && a.value)
    const updates = hasDuration
      ? { sets: draftSets, reps: null, weight: null, duration: draftDuration, adjustments: cleanedAdjustments }
      : { sets: draftSets, reps: draftReps, weight: draftWeight, duration: null, adjustments: cleanedAdjustments }
    const changedFields = []
    if (draftSets !== sets) changedFields.push('sets')
    if (!hasDuration && draftReps !== reps) changedFields.push('reps')
    if (hasDuration ? draftDuration !== duration : draftWeight !== weight) {
      changedFields.push(hasDuration ? 'duration' : 'weight')
    }
    if (JSON.stringify(cleanedAdjustments) !== JSON.stringify(adjustments)) changedFields.push('adjustments')
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
        className={`workout-card ${completed ? 'is-completed' : ''} ${isSwiping ? 'is-dragging' : ''} ${isReverting ? 'is-reverting' : ''}`}
        style={{ '--drag-x': `${dragPx}px` }}
      >
      <div className={`workout-card-main ${photoExpandActive ? 'is-photo-expanded' : ''}`}>
        {photoUrl && !photoFailed && (
          <div className={`workout-card-photo-thumb ${photoExpandActive ? 'is-expanded' : ''}`}>
            <img src={displayedPhotoSrc} alt="" onError={() => setPhotoFailed(true)} />
          </div>
        )}
        <div className={`workout-card-header-content ${photoExpandActive ? 'is-stacked' : ''}`}>
        <div className="workout-card-title-group">
          <h3
            className="workout-card-title"
            style={{ '--title-len': exercise.length }}
          >{exercise}</h3>
          {expanded && muscles.length > 0 && (
            <p className="workout-card-muscles-line">{muscles.map(formatMuscleName).join(', ')}</p>
          )}
        </div>

        <div className="workout-card-main-right">
          {/* Animated ref lives on this inner wrapper, not workout-card-main-right
              itself — a CSS transform on an ancestor becomes the new containing
              block for any position:absolute descendant, which would hijack the
              expand-btn below (it's positioned relative to workout-card-main). */}
          <div className="workout-card-stats-inner" ref={statsRef}>
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
                      onClick={() => setDraftDuration((v) => Math.max(MIN_DURATION, v - durationStepFor(v)))}
                      aria-label="Decrease duration"
                    >
                      <ChevronDownIcon size={14} />
                    </button>
                    <span className="stepper-value stepper-value-duration">{formatDuration(draftDuration)}</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setDraftDuration((v) => Math.min(MAX_DURATION, v + durationStepFor(v)))}
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
          </div>

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
      </div>

      <div className={`details-collapse ${expanded ? 'is-open' : ''}`}>
        <div className="details-collapse-inner" inert={!expanded}>
          <div className="workout-card-details">
            <div className="workout-card-info-stack">
            <div className={`workout-card-info ${showMuscles ? 'is-swapped-out' : ''}`}>
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
                {!editing && adjustments.map((note, index) => (
                  <li key={`adjustment-${index}`} className="adjustment-bullet">
                    <span className="bullet-marker" aria-hidden="true" />
                    Adjust {note.label}: {note.value}
                  </li>
                ))}
              </ul>

              {editing ? (
                <div className="adjustments-editor">
                  <span className="stat-label adjustments-title">Adjustments</span>
                  {draftAdjustments.map((entry, index) => (
                    <div key={index} className="adjustment-input-pair">
                      <input
                        ref={index === draftAdjustments.length - 1 ? newAdjustmentRef : null}
                        type="text"
                        className="adjustment-input adjustment-input-label"
                        value={entry.label}
                        placeholder="e.g. Seat height"
                        onChange={(e) => updateAdjustment(index, 'label', e.target.value)}
                      />
                      <input
                        type="text"
                        className="adjustment-input adjustment-input-value"
                        value={entry.value}
                        placeholder="e.g. 5"
                        onChange={(e) => updateAdjustment(index, 'value', e.target.value)}
                      />
                      <button
                        type="button"
                        className="adjustment-remove-btn"
                        onClick={() => removeAdjustment(index)}
                        aria-label="Remove adjustment note"
                      >
                        <XIcon size={12} />
                      </button>
                    </div>
                  ))}
                  <AdjustmentAddRow onClick={addAdjustmentField} />
                </div>
              ) : null}
            </div>

            <div className={`workout-card-muscle-view ${showMuscles ? 'is-swapped-in' : ''}`}>
              <MuscleDiagram muscles={muscles} sex={sex} />
            </div>
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
                  <button
                    type="button"
                    className={`icon-btn muscle-toggle-btn ${showMuscles ? 'is-active' : ''}`}
                    aria-label={showMuscles ? 'Show description' : 'Show muscles worked'}
                    aria-pressed={showMuscles}
                    onClick={() => setShowMuscles((v) => !v)}
                  >
                    <MuscleIcon size={22} />
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
