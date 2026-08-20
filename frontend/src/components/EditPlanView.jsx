import { useState } from 'react'
import DumbbellIcon from './icons/DumbbellIcon'
import MachineIcon from './icons/MachineIcon'
import PlankIcon from './icons/PlankIcon'
import TreadmillIcon from './icons/TreadmillIcon'
import StretchIcon from './icons/StretchIcon'
import UndoIcon from './icons/UndoIcon'
import RedoIcon from './icons/RedoIcon'
import GenerateIcon from './icons/GenerateIcon'
import MoveIcon from './icons/MoveIcon'
import CopyIcon from './icons/CopyIcon'
import TrashIcon from './icons/TrashIcon'
import XIcon from './icons/XIcon'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CATEGORY_ICONS = {
  free_weight: DumbbellIcon,
  machine: MachineIcon,
  body_weight: PlankIcon,
  warm_up: TreadmillIcon,
  stretch: StretchIcon,
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// Phase 1 (skeleton): navigation + a read-only view of the plan, reusing the
// existing collapsed WorkoutCard visual style. No selection, reordering,
// adding, or AI generation yet, and Save/Cancel are both just "go back" —
// there's nothing to commit until Phase 2 introduces real editing against a
// draft. See the manual-edit-mode design notes in memory for the full spec
// this is being built toward.
function EditPlanView({ allExercises, dayTitles, onClose }) {
  const [selectedDay, setSelectedDay] = useState(WEEKDAYS[new Date().getDay()])
  const dayExercises = allExercises.filter((item) => item.day === selectedDay)

  return (
    <div className="edit-plan-view">
      <div className="edit-plan-header">
        <div>
          <h2 className="edit-plan-title">Edit Plan</h2>
          {dayTitles.get(selectedDay) && (
            <span className="edit-plan-day-subtitle">{dayTitles.get(selectedDay)}</span>
          )}
        </div>
        <button type="button" className="edit-plan-close-btn" onClick={onClose} aria-label="Close">
          <XIcon size={16} />
        </button>
      </div>

      <div className="edit-plan-day-pills">
        {WEEKDAYS.map((day, i) => (
          <button
            key={day}
            type="button"
            className={`edit-plan-day-pill ${selectedDay === day ? 'is-active' : ''}`}
            onClick={() => setSelectedDay(day)}
          >
            {WEEKDAYS_SHORT[i]}
          </button>
        ))}
      </div>

      <div className="edit-plan-list">
        {dayExercises.length === 0 ? (
          <p className="edit-plan-empty">No exercises scheduled for {selectedDay}.</p>
        ) : (
          dayExercises.map((item) => {
            const Icon = CATEGORY_ICONS[item.category]
            return (
              <div key={item.id} className="edit-plan-card">
                {Icon && <Icon size={20} className="edit-plan-card-icon" />}
                <h3 className="edit-plan-card-title">{item.name}</h3>
                <div className="edit-plan-card-stats">
                  {item.sets > 0 && (
                    <div className="stat">
                      <span className="stat-label">Sets</span>
                      <span className="stat-value">{item.sets}</span>
                    </div>
                  )}
                  {item.reps > 0 && (
                    <div className="stat">
                      <span className="stat-label">Reps</span>
                      <span className="stat-value">{item.reps}</span>
                    </div>
                  )}
                  {item.duration != null ? (
                    <div className="stat">
                      <span className="stat-label">Duration</span>
                      <span className="stat-value">{formatDuration(item.duration)}</span>
                    </div>
                  ) : item.weight != null ? (
                    <div className="stat">
                      <span className="stat-label">Weight</span>
                      <span className="stat-value">{Math.round(item.weight)} kg</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Placeholder — none of these do anything yet (Phases 2/3/7). Shown now
          just to validate the intended shape of the screen. */}
      <div className="edit-plan-toolbar">
        <button type="button" className="edit-plan-toolbar-btn is-compact" disabled aria-label="Undo">
          <UndoIcon size={22} />
        </button>
        <button type="button" className="edit-plan-toolbar-btn is-compact" disabled aria-label="Redo">
          <RedoIcon size={22} />
        </button>
        <button type="button" className="edit-plan-toolbar-btn" disabled>
          <MoveIcon size={20} />
          <span>Move to</span>
        </button>
        <button type="button" className="edit-plan-toolbar-btn" disabled>
          <CopyIcon size={20} />
          <span>Copy to</span>
        </button>
        <button type="button" className="edit-plan-toolbar-btn is-compact" disabled aria-label="Delete">
          <TrashIcon size={20} />
        </button>
        <button type="button" className="edit-plan-toolbar-btn" disabled>
          <GenerateIcon size={20} />
          <span>Generate</span>
        </button>
      </div>
    </div>
  )
}

export default EditPlanView
