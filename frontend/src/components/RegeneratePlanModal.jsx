import { useState } from 'react'
import { createPortal } from 'react-dom'
import CheckIcon from './icons/CheckIcon'
import XIcon from './icons/XIcon'
import TreadmillIcon from './icons/TreadmillIcon'
import StretchIcon from './icons/StretchIcon'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function RegeneratePlanModal({ beginnerMode, onClose, onGenerate, onBeginnerChange }) {
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [beginner, setBeginner] = useState(beginnerMode)
  const [startDay, setStartDay] = useState('Sunday')
  const [includeWarmUp, setIncludeWarmUp] = useState(true)
  const [includeStretch, setIncludeStretch] = useState(true)
  const [confirming, setConfirming] = useState(false)

  function handleConfirm() {
    onGenerate({ daysPerWeek, beginner, startDay, includeWarmUp, includeStretch })
  }

  return (
    <>
      {createPortal(
        <div className="modal-overlay" onMouseDown={onClose}>
          <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
            <div className="modal-box regen-modal">
              <h2 className="regen-title">Regenerate plan</h2>

              <div className="regen-rows">
                <div className="regen-row">
                  <span className="regen-label">Days per week</span>
                  <div className="regen-count-group">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`regen-count-btn ${daysPerWeek === n ? 'is-active' : ''}`}
                        onClick={() => setDaysPerWeek(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="regen-row">
                  <span className="regen-label">Beginner mode</span>
                  <button
                    type="button"
                    className="theme-toggle-pill beginner-toggle-pill"
                    role="switch"
                    aria-checked={beginner}
                    data-on={String(beginner)}
                    onClick={() => {
                      const next = !beginner
                      setBeginner(next)
                      onBeginnerChange(next)
                    }}
                  >
                    <div className="theme-toggle-thumb" style={{ transform: `translateX(${beginner ? 100 : 0}%)` }} />
                    <span className={`theme-toggle-option ${!beginner ? 'is-active' : ''}`}>
                      <XIcon size={14} />
                    </span>
                    <span className={`theme-toggle-option ${beginner ? 'is-active' : ''}`}>
                      <CheckIcon size={14} />
                    </span>
                  </button>
                </div>

                <div className="regen-row">
                  <span className="regen-label">Start on</span>
                  <div className="regen-day-group">
                    {WEEKDAYS.map((day, i) => (
                      <button
                        key={day}
                        type="button"
                        className={`regen-day-btn ${startDay === day ? 'is-active' : ''}`}
                        onClick={() => setStartDay(day)}
                      >
                        {WEEKDAYS_SHORT[i]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="regen-row regen-row-checks">
                  <label className={`regen-check ${includeWarmUp ? 'is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={includeWarmUp}
                      onChange={() => setIncludeWarmUp((v) => !v)}
                    />
                    <span className="regen-check-box" aria-hidden="true" />
                    <TreadmillIcon size={24} />
                    <span className="regen-check-label">Warm up</span>
                  </label>
                  <label className={`regen-check ${includeStretch ? 'is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={includeStretch}
                      onChange={() => setIncludeStretch((v) => !v)}
                    />
                    <span className="regen-check-box" aria-hidden="true" />
                    <StretchIcon size={24} />
                    <span className="regen-check-label">Stretch</span>
                  </label>
                </div>
              </div>

              <button className="goals-save-btn" onClick={() => setConfirming(true)}>Generate</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirming && createPortal(
        <div className="modal-overlay regen-confirm-overlay" onMouseDown={() => setConfirming(false)}>
          <div className="modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-box regen-confirm-box">
              <p className="regen-confirm-heading">Erase current plan?</p>
              <p className="regen-confirm-body">
                Your current workout plan will be permanently erased. This cannot be undone.
              </p>
              <div className="regen-confirm-actions">
                <button className="regen-confirm-cancel" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button className="regen-confirm-ok" onClick={handleConfirm}>
                  Yes, erase it
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default RegeneratePlanModal
