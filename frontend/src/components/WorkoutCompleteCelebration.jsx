import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import FlameIcon from './icons/FlameIcon'

const TOTAL_DURATION_MS = 3000

function WorkoutCompleteCelebration({ message, oldStreak, newStreak, isNewBest, onDone }) {
  useEffect(() => {
    const timeout = setTimeout(onDone, TOTAL_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [onDone])

  return createPortal(
    <div className="celebration-overlay">
      <div className="celebration-message">{message}</div>
      <div className="celebration-bottom-row">
        <div className="celebration-coins">+20</div>
        <div className="celebration-streak">
          <span className="celebration-streak-number">
            <span className="celebration-streak-roll">
              <span className="celebration-streak-digit">{oldStreak}</span>
              <span className="celebration-streak-digit">{newStreak}</span>
            </span>
          </span>
          <FlameIcon
            size={34}
            className={`celebration-streak-flame ${isNewBest ? 'is-active is-flaring' : ''}`}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default WorkoutCompleteCelebration
