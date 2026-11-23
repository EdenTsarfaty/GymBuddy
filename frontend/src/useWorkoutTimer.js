import { useCallback, useEffect, useState } from 'react'

const WORKOUT_TIMER_STORAGE_KEY = 'gymbuddy-workout-timer'

// A timer left running this long was almost certainly forgotten, and the
// server rejects a session longer than this anyway (see MAX_SESSION_SEC in
// backend/src/streak.js) — so it's dropped instead of becoming a bogus one.
export const MAX_TIMER_MS = 24 * 60 * 60 * 1000

// The timer is never a ticking counter. It's three timestamps' worth of
// state — when it first started, how much active time was banked before the
// current stretch, and when the current stretch began (null while paused) —
// and the elapsed time is always computed from those against the clock. That
// way it keeps counting through a reload, a locked phone or a backgrounded
// tab, which a setInterval counter wouldn't.
//
//   { scheduledDate, startedAt, bankedMs, resumedAt }   (all ms since epoch
//   except scheduledDate, a YYYY-MM-DD string; resumedAt null = paused)
//
// Not cardio-specific on purpose — a gym day could use the same timer later.

export function elapsedMs(timer, now = Date.now()) {
  if (!timer) return 0
  return timer.bankedMs + (timer.resumedAt != null ? Math.max(0, now - timer.resumedAt) : 0)
}

export function startedTimer(scheduledDate, now = Date.now()) {
  return { scheduledDate, startedAt: now, bankedMs: 0, resumedAt: now }
}

export function pausedTimer(timer, now = Date.now()) {
  if (!timer || timer.resumedAt == null) return timer
  return { ...timer, bankedMs: elapsedMs(timer, now), resumedAt: null }
}

export function resumedTimer(timer, now = Date.now()) {
  if (!timer || timer.resumedAt != null) return timer
  return { ...timer, resumedAt: now }
}

// The session a finished timer amounts to, in the shape the server stores:
// start and end as UTC ISO strings, the phone's UTC offset at the start
// (minutes east of UTC), and the *active* seconds — so end minus start can be
// longer than the duration when it was paused along the way. Null if the
// timer never accumulated a whole second.
export function sessionFromTimer(timer, now = Date.now()) {
  if (!timer) return null
  const durationSec = Math.round(elapsedMs(timer, now) / 1000)
  if (durationSec < 1) return null
  return {
    started_at: new Date(timer.startedAt).toISOString(),
    ended_at: new Date(now).toISOString(),
    utc_offset_min: -new Date(timer.startedAt).getTimezoneOffset(),
    duration_sec: durationSec,
  }
}

function isValidTimer(value) {
  return value
    && typeof value.scheduledDate === 'string'
    && Number.isFinite(value.startedAt)
    && Number.isFinite(value.bankedMs)
    && (value.resumedAt === null || Number.isFinite(value.resumedAt))
}

export function readStoredTimer(userId, now = Date.now()) {
  try {
    const raw = localStorage.getItem(`${WORKOUT_TIMER_STORAGE_KEY}-${userId}`)
    const parsed = raw ? JSON.parse(raw) : null
    if (!isValidTimer(parsed)) return null
    return elapsedMs(parsed, now) > MAX_TIMER_MS ? null : parsed
  } catch { return null }
}

export function writeStoredTimer(userId, timer) {
  try {
    const key = `${WORKOUT_TIMER_STORAGE_KEY}-${userId}`
    if (timer) localStorage.setItem(key, JSON.stringify(timer))
    else localStorage.removeItem(key)
  } catch {}
}

// One running timer per user, tied to a scheduled date: it reads as idle for
// any other date (it stays stored, though — switching to look at another day
// doesn't discard it). Returns:
//   status     'idle' | 'running' | 'paused'
//   elapsedMs  active time so far (re-computed every second while running)
//   startedAt  ms epoch of the first start, or null while idle
//   start / pause / resume / reset
//   finish()   the session (see sessionFromTimer) the timer amounts to, and
//              clears it — null if there was nothing to finish
export function useWorkoutTimer(userId, scheduledDate) {
  const [stored, setStored] = useState(() => (userId ? readStoredTimer(userId) : null))
  const [now, setNow] = useState(() => Date.now())

  // Re-read when the user changes (the stored timer is per user).
  useEffect(() => {
    setStored(userId ? readStoredTimer(userId) : null)
  }, [userId])

  const timer = stored && stored.scheduledDate === scheduledDate ? stored : null
  const status = !timer ? 'idle' : timer.resumedAt != null ? 'running' : 'paused'

  // Drives the on-screen readout; the value itself always comes from the
  // timestamps, so a missed tick (background tab) costs nothing.
  useEffect(() => {
    if (status !== 'running') return undefined
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    function handleVisibility() {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [status])

  const commit = useCallback((next) => {
    setStored(next)
    if (userId) writeStoredTimer(userId, next)
    setNow(Date.now())
  }, [userId])

  const start = useCallback(() => {
    if (scheduledDate) commit(startedTimer(scheduledDate))
  }, [commit, scheduledDate])
  const pause = useCallback(() => { if (timer) commit(pausedTimer(timer)) }, [commit, timer])
  const resume = useCallback(() => { if (timer) commit(resumedTimer(timer)) }, [commit, timer])
  const reset = useCallback(() => { if (stored) commit(null) }, [commit, stored])
  const finish = useCallback(() => {
    if (!timer) return null
    const session = sessionFromTimer(timer)
    commit(null)
    return session
  }, [commit, timer])

  return {
    status,
    elapsedMs: timer ? elapsedMs(timer, status === 'running' ? now : Date.now()) : 0,
    startedAt: timer ? timer.startedAt : null,
    start,
    pause,
    resume,
    reset,
    finish,
  }
}
