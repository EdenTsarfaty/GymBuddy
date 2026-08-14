import { useEffect, useRef, useState } from 'react'
import PlayIcon from './icons/PlayIcon'
import PauseIcon from './icons/PauseIcon'
import ResetIcon from './icons/ResetIcon'
import CompleteIcon from './icons/CompleteIcon'

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function TimerView({ exercise, onComplete }) {
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [completedLaps, setCompletedLaps] = useState(0)

  // Date.now()-based, not a naive incrementing counter, to avoid setInterval drift.
  const startRef = useRef(null)
  const rafRef = useRef(null)
  // How many lap-boundaries have already been folded into `completedLaps` for the
  // current elapsedMs run — reset to 0 on Reset so already-counted laps aren't
  // re-counted, but `completedLaps` itself is never rolled back by Reset.
  const countedLapsRef = useRef(0)

  const duration = exercise?.duration

  useEffect(() => {
    if (!running) return

    function tick() {
      const now = Date.now()
      const ms = now - startRef.current
      setElapsedMs(ms)

      if (duration) {
        const currentLapCount = Math.floor(ms / 1000 / duration)
        if (currentLapCount > countedLapsRef.current) {
          const delta = currentLapCount - countedLapsRef.current
          countedLapsRef.current = currentLapCount
          setCompletedLaps((c) => c + delta)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, duration])

  // Keep the screen on while the timer is running. The lock is auto-released by
  // the browser the moment the tab loses visibility, so it has to be re-acquired
  // on visibilitychange too, not just once when play is pressed. Unsupported
  // browsers (no Wake Lock API, or the request is rejected) just no-op — the
  // timer itself doesn't depend on it.
  useEffect(() => {
    if (!running) return

    let cancelled = false
    let lock = null

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock?.request('screen')
        if (cancelled) {
          sentinel?.release().catch(() => {})
          return
        }
        lock = sentinel
      } catch {
        // Unsupported or denied — fine, the timer still works without it.
      }
    }

    acquire()

    function handleVisibility() {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      lock?.release().catch(() => {})
    }
  }, [running])

  function handlePlayPause() {
    if (running) {
      setRunning(false)
      return
    }
    startRef.current = Date.now() - elapsedMs
    setRunning(true)
  }

  function handleReset() {
    setRunning(false)
    setElapsedMs(0)
    countedLapsRef.current = 0
  }

  if (!exercise) return null

  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const hasSets = exercise.sets != null
  // A duration-only exercise (no sets) has just the one lap to finish — the ring
  // completing a full sweep is the whole story, so the checkmark's threshold is
  // "one lap done" instead of "every set done".
  const completeThreshold = hasSets ? exercise.sets : 1
  const canComplete = completedLaps >= completeThreshold

  // Brightness at any angle = how recently the head painted it. Just behind the
  // head is freshly painted (brightest); just ahead of it was painted a whole lap
  // ago (darkest). In the ring's own frame that's a fixed dim→bright ramp ending
  // at the head — a shape that never changes, it only rotates. So there is exactly
  // one animation here, not two: during lap 1 the arc is still growing to a full
  // circle, and from then on it's the same shape spinning forever. Nothing is
  // remounted, no value ever jumps backwards, so there's no seam between "laps".
  const laps = duration ? elapsedMs / 1000 / duration : 0
  const arcDeg = Math.min(laps, 1) * 360
  const spinDeg = laps * 360

  return (
    <div className="timer-view">
      <div className="timer-ring-wrap">
        <div
          className="timer-ring-layer timer-ring-sweep"
          style={{ '--arc': `${arcDeg}deg`, transform: `rotate(${spinDeg}deg)` }}
        />
        <div className="timer-center">
          <span className="timer-time">{formatMMSS(elapsedSeconds)}</span>
          <div className="timer-controls">
            <button
              type="button"
              className="timer-btn timer-btn-play"
              onClick={handlePlayPause}
              aria-label={running ? 'Pause' : 'Play'}
            >
              {running ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
            </button>
            <button type="button" className="timer-btn" onClick={handleReset} aria-label="Reset">
              <ResetIcon size={24} />
            </button>
          </div>
        </div>
      </div>

      <div className="timer-sets">
        {hasSets && (
          <>
            <div className="timer-sets-label">Sets:</div>
            <div className="timer-sets-row">
              {Array.from({ length: exercise.sets }).map((_, i) => (
                <div key={i} className={`timer-set-square ${i < completedLaps ? 'is-done' : ''}`} />
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          className={`timer-btn-complete ${canComplete ? 'is-visible' : ''}`}
          aria-label="Mark complete"
          onClick={onComplete}
        >
          <CompleteIcon size={54} />
        </button>
      </div>
    </div>
  )
}

export default TimerView
