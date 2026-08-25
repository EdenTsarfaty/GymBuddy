import { useState } from 'react'
import CompleteIcon from './icons/CompleteIcon'
import CircleSlashIcon from './icons/CircleSlashIcon'
import ChevronDownIcon from './icons/ChevronDownIcon'
import DumbbellIcon from './icons/DumbbellIcon'
import MachineIcon from './icons/MachineIcon'
import PlankIcon from './icons/PlankIcon'
import TreadmillIcon from './icons/TreadmillIcon'
import StretchIcon from './icons/StretchIcon'

const CATEGORY_META = {
  free_weight:  { label: 'Free weight',  Icon: DumbbellIcon },
  machine:      { label: 'Machine',      Icon: MachineIcon },
  body_weight:  { label: 'Body weight',  Icon: PlankIcon },
  warm_up:      { label: 'Warm up',      Icon: TreadmillIcon },
  stretch:      { label: 'Stretch',      Icon: StretchIcon },
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// Read-only counterpart to WorkoutCard, for one entry from GET
// /api/workout-log/day. Deliberately a separate, much smaller component
// rather than a "readOnly" mode bolted onto WorkoutCard — none of that
// component's interactive machinery (swipe, chat, swap, edit, timers,
// cascade) applies to a frozen historical row with no live completion state
// behind it. sets/reps/weight/duration always come from the recorded
// snapshot; description/bullets/category only render when `live` is present
// (completed and not stale) — see workoutHistory.js's getDay for how that's
// decided.
function HistoryWorkoutCard({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const { name, sets, reps, weight, duration, completed, stale, live } = entry
  const hasSets = sets > 0
  const hasReps = reps > 0
  const hasDuration = duration !== null && duration !== undefined
  const canExpand = !!live && (live.description || (live.bullets && live.bullets.length > 0))

  return (
    <div className={`workout-card history-card ${completed ? 'is-completed' : 'is-missed'}`}>
      <div className="workout-card-main">
        <div className="workout-card-header-content">
          <div className="workout-card-title-group">
            <div className="history-card-status">
              {completed ? <CompleteIcon size={16} /> : <CircleSlashIcon size={16} />}
              <h3 className="workout-card-title" style={{ '--title-len': name.length }}>{name}</h3>
            </div>
            {stale && <p className="history-card-note">This exercise has since changed — showing it as it was</p>}
            {!completed && <p className="history-card-note">Not completed</p>}
          </div>

          <div className="workout-card-main-right">
            <div className="workout-card-right">
              {hasSets && (
                <div className="stat">
                  <span className="stat-label">Sets</span>
                  <span className="stat-value">{sets}</span>
                </div>
              )}
              {hasReps && (
                <div className="stat">
                  <span className="stat-label">Reps</span>
                  <span className="stat-value reps-value">{reps}</span>
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

            {canExpand && (
              <button
                type="button"
                className={`expand-btn ${expanded ? 'is-open' : ''}`}
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-label={expanded ? 'Collapse details' : 'Expand details'}
              >
                <ChevronDownIcon size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {canExpand && (
        <div className={`details-collapse ${expanded ? 'is-open' : ''}`}>
          <div className="details-collapse-inner" inert={!expanded}>
            <div className="workout-card-details">
              <div className="workout-card-info">
                {live.category && CATEGORY_META[live.category] && (() => {
                  const { label, Icon } = CATEGORY_META[live.category]
                  return (
                    <div className="exercise-category">
                      <Icon size={25} />
                      <span>{label}</span>
                    </div>
                  )
                })()}
                {live.description && <p className="workout-card-description">{live.description}</p>}
                {live.bullets && live.bullets.length > 0 && (
                  <ul className="instruction-bullets">
                    {live.bullets.map((bullet) => (
                      <li key={bullet}>
                        <span className="bullet-marker" aria-hidden="true" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HistoryWorkoutCard
