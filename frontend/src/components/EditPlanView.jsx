import { useState } from 'react'
import DumbbellIcon from './icons/DumbbellIcon'
import MachineIcon from './icons/MachineIcon'
import PlankIcon from './icons/PlankIcon'
import TreadmillIcon from './icons/TreadmillIcon'
import StretchIcon from './icons/StretchIcon'
import UndoIcon from './icons/UndoIcon'
import RedoIcon from './icons/RedoIcon'
import GenerateIcon from './icons/GenerateIcon'
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
        <div className="edit-plan-header-right">
          <button type="button" className="edit-plan-icon-btn" disabled aria-label="Undo">
            <UndoIcon size={17} />
          </button>
          <button type="button" className="edit-plan-icon-btn" disabled aria-label="Redo">
            <RedoIcon size={17} />
          </button>
          <button type="button" className="edit-plan-pill-btn is-filled" disabled>
            <GenerateIcon size={14} />
            <span>Generate</span>
          </button>
          <button type="button" className="edit-plan-close-btn" onClick={onClose} aria-label="Close">
            <XIcon size={16} />
          </button>
        </div>
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
                  {item.sets > 0 && item.reps > 0 && (
                    <span className="edit-plan-stat">{item.sets}×{item.reps}</span>
                  )}
                  {item.duration != null ? (
                    <span className="edit-plan-stat">{formatDuration(item.duration)}</span>
                  ) : item.weight != null ? (
                    <span className="edit-plan-stat">{Math.round(item.weight)} kg</span>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default EditPlanView
