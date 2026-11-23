import { useState } from 'react'
import { createPortal } from 'react-dom'

const QUICK_PICKS = [15, 30, 45, 60]
const MAX_MINUTES = 24 * 60

// The native date and time inputs speak local wall-clock values with no zone
// ("YYYY-MM-DD" and "HH:mm"), so these are built by hand (toISOString would
// be UTC) and `new Date(`${date}T${time}`)` reads them back as local.
const pad = (n) => String(n).padStart(2, '0')
const toDateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toTimeValue = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// The "log what you did" modal for a session that was never timed — the
// forgot-to-press-play path. It collects a start (date and time, so a
// Monday swim can still be logged on Wednesday) and a length, and hands back
// the session in the shape the server stores. Start follows "now minus the
// duration" until it's been edited by hand, since the usual case is logging
// right after finishing. Uses the shared modal shell (centered on desktop,
// a bottom sheet on mobile — see .modal-box).
//
//   onSave(session)  the session ({ started_at, ended_at, utc_offset_min, duration_sec })
//   onSkip()         complete the entry with no details at all
//   onCancel()       close without completing anything
function LogSessionSheet({ activityLabel, plannedMinutes, onSave, onSkip, onCancel }) {
  const [durationText, setDurationText] = useState(plannedMinutes ? String(plannedMinutes) : '')
  const initialStart = new Date(Date.now() - (plannedMinutes || 0) * 60000)
  const [dateText, setDateText] = useState(() => toDateValue(initialStart))
  const [timeText, setTimeText] = useState(() => toTimeValue(initialStart))
  const [startTouched, setStartTouched] = useState(false)

  function changeDuration(text) {
    setDurationText(text)
    const m = Number(text)
    if (!startTouched && Number.isInteger(m) && m >= 1 && m <= MAX_MINUTES) {
      const next = new Date(Date.now() - m * 60000)
      setDateText(toDateValue(next))
      setTimeText(toTimeValue(next))
    }
  }

  const minutes = Number(durationText)
  const durationValid = durationText.trim() !== '' && Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES
  const start = new Date(`${dateText}T${timeText}`)
  const startValid = dateText !== '' && timeText !== '' && !Number.isNaN(start.getTime())

  let error = null
  if (durationText.trim() !== '' && !durationValid) error = 'Duration must be between 1 minute and 24 hours.'
  else if (!startValid) error = 'Pick a start date and time.'
  // A minute of slack, since the start follows "now minus duration" to the minute.
  else if (durationValid && start.getTime() + minutes * 60000 > Date.now() + 60000) error = 'That session would end in the future.'

  const canSave = durationValid && startValid && !error

  function handleSave() {
    if (!canSave) return
    onSave({
      started_at: start.toISOString(),
      ended_at: new Date(start.getTime() + minutes * 60000).toISOString(),
      utc_offset_min: -start.getTimezoneOffset(),
      duration_sec: minutes * 60,
    })
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onCancel} aria-label="Close">✕</button>
        <div className="modal-box log-session-modal">
          <div className="log-session-heading">
            <h2 className="regen-title">Log your session</h2>
            {activityLabel && <p className="log-session-subtitle">{activityLabel}</p>}
          </div>

          <div className="log-session-fields">
            <div className="log-session-field">
              <span className="log-session-label">Started</span>
              <div className="log-session-start-row">
                <input
                  type="date"
                  className="log-session-input log-session-date"
                  value={dateText}
                  max={toDateValue(new Date())}
                  onChange={(e) => { setDateText(e.target.value); setStartTouched(true) }}
                  aria-label="Start date"
                />
                <input
                  type="time"
                  className="log-session-input log-session-time"
                  value={timeText}
                  onChange={(e) => { setTimeText(e.target.value); setStartTouched(true) }}
                  aria-label="Start time"
                />
              </div>
            </div>

            <div className="log-session-field">
              <span className="log-session-label">Duration</span>
              <div className="log-session-duration-row">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_MINUTES}
                  className="log-session-input log-session-minutes"
                  value={durationText}
                  onChange={(e) => changeDuration(e.target.value)}
                  aria-label="Duration in minutes"
                />
                <span className="log-session-unit">min</span>
                <div className="log-session-picks">
                  {QUICK_PICKS.map((m) => (
                    <button key={m} type="button" className="log-session-pick" onClick={() => changeDuration(String(m))}>{m}</button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="log-session-error">{error}</p>}
          </div>

          <div className="log-session-actions">
            <button type="button" className="complete-workout-btn" onClick={handleSave} disabled={!canSave}>
              Save
            </button>
            <div className="log-session-secondary">
              <button type="button" className="log-session-pill log-session-skip" onClick={onSkip}>Skip details</button>
              <button type="button" className="log-session-pill" onClick={onCancel}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default LogSessionSheet
