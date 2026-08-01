import { useRef, useState } from 'react'
import ChatIcon from './icons/ChatIcon'
import CheckIcon from './icons/CheckIcon'
import ChevronDownIcon from './icons/ChevronDownIcon'
import ChevronUpIcon from './icons/ChevronUpIcon'
import CircleSlashIcon from './icons/CircleSlashIcon'
import PencilIcon from './icons/PencilIcon'
import SwapIcon from './icons/SwapIcon'
import YouTubeIcon from './icons/YouTubeIcon'

const MIN_SETS = 1
const MAX_SETS = 10
const MIN_WEIGHT = 0
const MAX_WEIGHT = 200
const WEIGHT_PX_PER_UNIT = 22

function WorkoutCard({ exercise, sets, weight, description, bullets, onSave }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
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
                <button type="button" className="icon-btn swap-btn" aria-label="Ask AI to swap this exercise">
                  <SwapIcon size={16} />
                </button>
              ) : (
                <>
                  <button type="button" className="icon-btn" aria-label="Chat about this exercise">
                    <ChatIcon size={16} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Watch on YouTube">
                    <YouTubeIcon size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WorkoutCard
