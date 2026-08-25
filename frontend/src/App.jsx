import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import ChatView from './components/ChatView'
import TimerView from './components/TimerView'
import WorkoutCard from './components/WorkoutCard'
import HistoryWorkoutCard from './components/HistoryWorkoutCard'
import Logo from './components/Logo'
import SettingsPage from './components/SettingsPage'
import BugIcon from './components/icons/BugIcon'
import CalendarIcon from './components/icons/CalendarIcon'
import OfflineIcon from './components/icons/OfflineIcon'
import ChevronLeftIcon from './components/icons/ChevronLeftIcon'
import GearIcon from './components/icons/GearIcon'
import FlameIcon from './components/icons/FlameIcon'
import MusicProviderIcon from './components/icons/MusicProviderIcon'
import MusicProviderPanel from './components/MusicProviderPanel'
import WorkoutCompleteCelebration from './components/WorkoutCompleteCelebration'
import PlugOffIcon from './components/icons/PlugOffIcon'
import PlanGeneratingOverlay from './components/PlanGeneratingOverlay'
import RegeneratePlanModal from './components/RegeneratePlanModal'
import EditPlanView from './components/EditPlanView'
import WorkoutProfilePage from './components/WorkoutProfilePage'
import StreakFreezeNotice from './components/StreakFreezeNotice'
import TableIcon from './components/icons/TableIcon'
import ZzzIcon from './components/icons/ZzzIcon'
import CheckAllIcon from './components/icons/CheckAllIcon'
import UndoIcon from './components/icons/UndoIcon'
import { API_BASE } from './apiBase'
import './App.css'

const APP_VERSION = 'RC 0.8.4'
const THEME_MODE_STORAGE_KEY = 'gymbuddy-theme-mode'
const BEGINNER_MODE_STORAGE_KEY = 'gymbuddy-beginner-mode'
const MUSIC_PROVIDER_STORAGE_KEY = 'gymbuddy-music-provider'
const CURRENT_USER_STORAGE_KEY = 'gymbuddy-current-user-id'
const PENDING_EDITS_STORAGE_KEY = 'gymbuddy-pending-edits'
const STREAK_FREEZE_SUSPEND_STORAGE_KEY = 'gymbuddy-streak-freeze-suspended-until'
const STREAK_FREEZE_SUSPEND_MS = 3 * 60 * 60 * 1000
const REPORT_BUG_URL = `https://t.me/Azsper?text=${encodeURIComponent('Hey! I found a bug in GymBuddy — ')}`

const CATEGORY_ORDER = { warm_up: 0, stretch: 2 }
function categoryRank(category) {
  return CATEGORY_ORDER[category] ?? 1
}

const today = new Date().toLocaleDateString(undefined, { weekday: 'long' })

const WORKOUT_COMPLETE_MESSAGES = [
  'What a king!',
  'Good job!',
  'Nicely done!',
  'Crushed it!',
  'Beast mode!',
  'You showed up!',
  'Locked in!',
]

function getFirstDayOfWeek() {
  try {
    const locale = new Intl.Locale(navigator.language)
    if (typeof locale.getWeekInfo === 'function') {
      return locale.getWeekInfo().firstDay
    }
  } catch {
    // Intl.Locale / getWeekInfo unsupported in this browser
  }
  return 1 // ISO default: Monday
}

function getOrderedWeekdays() {
  const firstDay = getFirstDayOfWeek() // 1 = Monday ... 7 = Sunday
  const referenceMonday = new Date(2024, 0, 1) // a known Monday
  return Array.from({ length: 7 }, (_, i) => {
    const offset = (firstDay - 1 + i) % 7
    const date = new Date(referenceMonday)
    date.setDate(referenceMonday.getDate() + offset)
    return date.toLocaleDateString(undefined, { weekday: 'long' })
  })
}

const weekdays = getOrderedWeekdays()

// Weeks of 7 cells for the given month, padded with `null` for the leading/
// trailing days that belong to adjacent months (left blank, not rendered as
// clickable adjacent-month dates — see the month-view plan for why).
function getMonthGridWeeks(monthDate) {
  const firstDay = getFirstDayOfWeek() // 1 = Monday ... 7 = Sunday
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const jsWeekday = firstOfMonth.getDay() // 0 = Sunday ... 6 = Saturday
  const ordinalWeekday = jsWeekday === 0 ? 7 : jsWeekday // 1 = Monday ... 7 = Sunday
  const leadingBlanks = (ordinalWeekday - firstDay + 7) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = Array(leadingBlanks).fill(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), day })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysISO(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

function weekdayNameFromISO(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })
}

function formatHistoryDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The most recent date (today or earlier, within the last 6 days) whose
// weekday name is `day` — used by the weekday picker to resolve "Monday" to
// an actual calendar date so it can decide whether that's today (live plan)
// or already passed (history).
function mostRecentOccurrenceISO(day, todayISO) {
  const todayIdx = weekdays.indexOf(weekdayNameFromISO(todayISO))
  const dayIdx = weekdays.indexOf(day)
  const diff = (todayIdx - dayIdx + 7) % 7
  return addDaysISO(todayISO, -diff)
}

// Next date after `dateStr` whose weekday is in `scheduledDays` — mirrors the
// backend's grace-window boundary (backend/src/streak.js) so a missed day only
// reads as "missed" once its grace window has actually closed.
function nextScheduledDateAfter(dateStr, scheduledDays) {
  let cursor = dateStr
  for (let i = 0; i < 14; i++) {
    cursor = addDaysISO(cursor, 1)
    if (scheduledDays.has(weekdayNameFromISO(cursor))) return cursor
  }
  return null
}

// Maps ISO date -> 'green' (performed, on time or late) | 'orange' (grace-period
// trail between a missed scheduled day and its late completion) | 'red' (missed,
// grace window closed, never performed). Dates absent from the map get no dot.
function buildWorkoutIndicators(workoutLog, scheduledDays, todayStr, protectedDates) {
  const map = new Map()

  for (const row of workoutLog) {
    if (row.performed_date) map.set(row.performed_date, 'green')
  }

  for (const row of workoutLog) {
    if (row.performed_date && row.performed_date !== row.scheduled_date) {
      let cursor = row.scheduled_date
      while (cursor < row.performed_date) {
        if (!map.has(cursor)) map.set(cursor, 'orange')
        cursor = addDaysISO(cursor, 1)
      }
    } else if (!row.performed_date) {
      // Mirrors recomputeStreak's own freeze check (backend/src/streak.js) —
      // a missed date the streak freeze covers never breaks the streak, so
      // it's shown as saved rather than orange/red. protectedDates comes
      // straight from workout_log's own `frozen` column (durable per row,
      // same as performed_date), not a live from/until comparison — a date
      // stays protected even after a later freeze reactivation overwrites
      // the current window.
      if (protectedDates.has(row.scheduled_date)) {
        if (!map.has(row.scheduled_date)) map.set(row.scheduled_date, 'purple')
        continue
      }
      const nextDate = nextScheduledDateAfter(row.scheduled_date, scheduledDays)
      if (nextDate && todayStr >= nextDate) {
        if (!map.has(row.scheduled_date)) map.set(row.scheduled_date, 'red')
      } else {
        // Grace window still open — trail orange from the scheduled day through
        // yesterday. Today itself stays undecided (no dot) since it could still
        // be completed before the day is over.
        let cursor = row.scheduled_date
        while (cursor < todayStr) {
          if (!map.has(cursor)) map.set(cursor, 'orange')
          cursor = addDaysISO(cursor, 1)
        }
      }
    }
  }

  return map
}

function getInitialBeginnerMode() {
  return localStorage.getItem(BEGINNER_MODE_STORAGE_KEY) === 'true'
}

function getInitialMusicProvider() {
  return localStorage.getItem(MUSIC_PROVIDER_STORAGE_KEY) || 'none'
}

function getInitialThemeMode() {
  const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

function resolveTheme(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

function App() {
  const [view, setView] = useState('home')
  const [themeMode, setThemeMode] = useState(getInitialThemeMode)
  const [beginnerMode, setBeginnerMode] = useState(getInitialBeginnerMode)
  const [musicProvider, setMusicProvider] = useState(getInitialMusicProvider)
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(getInitialThemeMode()))
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [allExercises, setAllExercises] = useState([])
  const [completedExerciseIds, setCompletedExerciseIds] = useState(() => new Set())
  const [cascadeToken, setCascadeToken] = useState(0)
  // Remembers just the last completion (whichever exercise ids the last cascade
  // press or finishing swipe actually flipped), in memory only — cleared on
  // reload and the moment anything is unchecked, since "all complete" stops
  // being true. That's what lets the undo button target only that action.
  const [lastCompletionBatch, setLastCompletionBatch] = useState(null)
  const preCompletionSnapshotRef = useRef(new Set())
  // Snapshot taken the instant "Complete Workout" is clicked, before any of the
  // cascade's staggered per-card completions start — unlike preCompletionSnapshotRef
  // (which keeps re-snapshotting on every still-incomplete render and would end
  // up capturing only the second-to-last card), this one is frozen at the start
  // so the diff against it covers the whole cascade batch, not just the last card.
  const cascadeStartSnapshotRef = useRef(null)
  const [justRevertedIds, setJustRevertedIds] = useState(() => new Set())
  const [streakUndoTick, setStreakUndoTick] = useState(null)

  // Fires the per-exercise history record alongside the local toggle —
  // independent of the whole-day workout-log/complete call, which only fires
  // once every card in the day is done (see the effect below).
  function recordExerciseCompletion(id, completed) {
    if (!currentUser) return
    const endpoint = completed ? 'exercise-complete' : 'exercise-uncomplete'
    fetch(`${API_BASE}/api/workout-log/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, exercise_id: id }),
    }).catch(() => {})
  }

  function toggleCompleted(id) {
    const wasCompleted = completedExerciseIds.has(id)
    // Un-completing while a stale non-zero cascadeToken lingers would replay
    // the whole cascade the next time this card remounts (e.g. leaving and
    // returning from Settings) — WorkoutCard's cascade effect only checks
    // "is cascadeToken truthy and am I not completed", it has no memory of
    // having already run for this token across a remount.
    if (wasCompleted) setCascadeToken(0)
    setCompletedExerciseIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    recordExerciseCompletion(id, !wasCompleted)
  }

  function markCompleted(id) {
    if (completedExerciseIds.has(id)) return
    setCompletedExerciseIds((current) => (current.has(id) ? current : new Set(current).add(id)))
    recordExerciseCompletion(id, true)
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [serverDown, setServerDown] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [planMenuOpen, setPlanMenuOpen] = useState(false)
  const [planMenuScreen, setPlanMenuScreen] = useState('root')
  const [musicPanelOpen, setMusicPanelOpen] = useState(false)
  const [musicPanelRemoveMode, setMusicPanelRemoveMode] = useState(false)
  const [planView, setPlanView] = useState('week')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(today)
  // Non-null when viewing a specific past date's frozen record instead of
  // the live plan for selectedDay — set by clicking a past date in month
  // view, or a weekday whose most recent occurrence this week has already
  // passed. Always null for today/future dates, which just show the live
  // plan as before.
  const [historyDate, setHistoryDate] = useState(null)
  const [historyEntries, setHistoryEntries] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [daysWithWorkouts, setDaysWithWorkouts] = useState(new Set())
  const [dayTitles, setDayTitles] = useState(new Map())
  const [exercisesRefreshKey, setExercisesRefreshKey] = useState(0)
  const [workoutLog, setWorkoutLog] = useState([])
  const [userSex, setUserSex] = useState(null)
  const [workoutLogRefreshKey, setWorkoutLogRefreshKey] = useState(0)
  const [streak, setStreak] = useState({ current_streak: 0, longest_streak: 0, streak_freeze_until: null, streak_freeze_from: null, protected_dates: [] })
  const [freezeSuspendedUntil, setFreezeSuspendedUntil] = useState(0)
  const [settingsFlashToken, setSettingsFlashToken] = useState(0)
  const showFreezeScreen = !!streak.streak_freeze_until && Date.now() >= freezeSuspendedUntil
  const [celebration, setCelebration] = useState(null)
  const [flameAnimating, setFlameAnimating] = useState(false)
  const prevStreakRef = useRef(0)
  const flameTimeoutRef = useRef(null)
  const [pendingEdits, setPendingEdits] = useState(() => {
    try {
      const uid = Number(localStorage.getItem(CURRENT_USER_STORAGE_KEY))
      if (!uid) return new Map()
      const cached = localStorage.getItem(`${PENDING_EDITS_STORAGE_KEY}-${uid}`)
      return cached ? new Map(JSON.parse(cached)) : new Map()
    } catch { return new Map() }
  })
  const pendingEditsRef = useRef(pendingEdits)
  const currentUserRef = useRef(currentUser)
  const planMenuRef = useRef(null)
  const pageRef = useRef(null)
  const musicButtonRef = useRef(null)
  const musicPanelElRef = useRef(null)
  const musicLongPressTimerRef = useRef(null)
  const musicLongPressFiredRef = useRef(false)

  useEffect(() => {
    pendingEditsRef.current = pendingEdits
  }, [pendingEdits])

  useEffect(() => {
    currentUserRef.current = currentUser
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    try {
      const cachedPending = localStorage.getItem(`${PENDING_EDITS_STORAGE_KEY}-${currentUser.id}`)
      setPendingEdits(cachedPending ? new Map(JSON.parse(cachedPending)) : new Map())
    } catch {}
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser) return
    const stored = Number(localStorage.getItem(`${STREAK_FREEZE_SUSPEND_STORAGE_KEY}-${currentUser.id}`))
    setFreezeSuspendedUntil(stored || 0)
  }, [currentUser?.id])

  function suspendStreakFreezeNotice() {
    const until = Date.now() + STREAK_FREEZE_SUSPEND_MS
    const uid = currentUserRef.current?.id
    if (uid) localStorage.setItem(`${STREAK_FREEZE_SUSPEND_STORAGE_KEY}-${uid}`, String(until))
    setFreezeSuspendedUntil(until)
  }

  function persistPending(map) {
    const uid = currentUserRef.current?.id
    if (!uid) return
    try { localStorage.setItem(`${PENDING_EDITS_STORAGE_KEY}-${uid}`, JSON.stringify([...map])) } catch {}
  }

  function flushPendingEdits() {
    for (const [id, { updates }] of pendingEditsRef.current) {
      fetch(`${API_BASE}/api/exercises/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to save')
          setPendingEdits((current) => {
            if (!current.has(id)) return current
            const next = new Map(current)
            next.delete(id)
            persistPending(next)
            return next
          })
        })
        .catch(() => {})
    }
  }

  // A still-open missed workout — scheduled in the past, not performed, and its
  // grace window (up through the day before the next scheduled occurrence)
  // hasn't closed yet. Only relevant when today itself has nothing scheduled,
  // so there's an empty slot to surface it in instead of a blank "no workout".
  const pendingCatchUp = useMemo(() => {
    if (daysWithWorkouts.has(today)) return null
    const todayISO = toISODate(new Date())
    return workoutLog.find((row) => {
      if (row.performed_date || row.scheduled_date >= todayISO) return false
      const nextDate = nextScheduledDateAfter(row.scheduled_date, daysWithWorkouts)
      return nextDate && todayISO < nextDate
    }) ?? null
  }, [workoutLog, daysWithWorkouts])

  const catchUpWeekday = pendingCatchUp ? weekdayNameFromISO(pendingCatchUp.scheduled_date) : null
  const isShowingCatchUp = !historyDate && selectedDay === today && !!catchUpWeekday
  const effectiveDay = isShowingCatchUp ? catchUpWeekday : selectedDay
  const catchUpTooltipText = catchUpWeekday
    ? `Catching up: ${catchUpWeekday}${dayTitles.get(catchUpWeekday) ? ` — ${dayTitles.get(catchUpWeekday)}` : ''}`
    : ''

  const exercises = useMemo(
    () => allExercises
      .filter((item) => item.day === effectiveDay)
      .sort((a, b) => categoryRank(a.category) - categoryRank(b.category)),
    [allExercises, effectiveDay],
  )

  const workoutIndicators = useMemo(
    () => buildWorkoutIndicators(workoutLog, daysWithWorkouts, toISODate(new Date()), new Set(streak.protected_dates)),
    [workoutLog, daysWithWorkouts, streak.protected_dates],
  )

  // Earliest month the month-view calendar can navigate back to — the month of
  // the oldest workout_log row, or the current month if there's no history yet.
  const earliestCalendarMonth = useMemo(() => {
    if (workoutLog.length === 0) {
      const now = new Date()
      return new Date(now.getFullYear(), now.getMonth(), 1)
    }
    const earliestDate = workoutLog.reduce(
      (min, row) => (row.scheduled_date < min ? row.scheduled_date : min),
      workoutLog[0].scheduled_date,
    )
    const [y, m] = earliestDate.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }, [workoutLog])

  const isPrevMonthDisabled =
    calendarMonth.getFullYear() === earliestCalendarMonth.getFullYear() &&
    calendarMonth.getMonth() === earliestCalendarMonth.getMonth()

  useEffect(() => {
    let cancelled = false
    let retryTimeout = null
    let nextCheckTimeout = null
    let checking = false

    function pingOnce() {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      return fetch(`${API_BASE}/api/health`, { signal: controller.signal, cache: 'no-store' })
        .then((res) => res.ok)
        .catch(() => false)
        .finally(() => clearTimeout(timeout))
    }

    // Android throttles/suspends background tabs — the first ping right after
    // resuming from multitasking often races the network stack waking back up
    // and times out even though the server is fine. Rather than flip the
    // offline banner on a single failed ping, retry a few times quickly before
    // believing it.
    async function checkHealth() {
      if (checking) return
      checking = true
      if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null }
      if (nextCheckTimeout) { clearTimeout(nextCheckTimeout); nextCheckTimeout = null }

      let ok = await pingOnce()
      if (!cancelled && !ok) {
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          await new Promise((resolve) => { retryTimeout = setTimeout(resolve, 1200) })
          if (cancelled) break
          ok = await pingOnce()
        }
      }

      if (!cancelled) {
        setIsOffline(!ok)
        if (ok && pendingEditsRef.current.size > 0) flushPendingEdits()
      }
      checking = false

      // Poll faster while offline so recovery is noticed sooner, back to the
      // normal cadence once healthy again.
      if (!cancelled) {
        nextCheckTimeout = setTimeout(checkHealth, ok ? 15000 : 5000)
      }
    }

    checkHealth()

    // Also re-check immediately when the app comes back to the foreground,
    // instead of waiting for the next (possibly delayed) scheduled check.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') checkHealth()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      if (retryTimeout) clearTimeout(retryTimeout)
      if (nextCheckTimeout) clearTimeout(nextCheckTimeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode)
    setResolvedTheme(resolveTheme(themeMode))

    if (themeMode !== 'system') return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    function handleSystemChange() {
      setResolvedTheme(resolveTheme('system'))
    }
    mql.addEventListener('change', handleSystemChange)
    return () => mql.removeEventListener('change', handleSystemChange)
  }, [themeMode])

  useEffect(() => {
    const controller = new AbortController()
    // Longer than the service worker's own 4s networkTimeoutSeconds, so it
    // always gets a chance to fall back to cache before we abort the request.
    const timeout = setTimeout(() => controller.abort(), 8000)

    fetch(`${API_BASE}/api/users`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setUsers(data)
        if (data.length > 0) {
          const savedId = Number(localStorage.getItem(CURRENT_USER_STORAGE_KEY))
          const saved = savedId && data.find((u) => u.id === savedId)
          setCurrentUser(saved || data[0])
        } else setLoading(false)
      })
      .catch(() => {
        setServerDown(true)
        setLoading(false)
      })
      .finally(() => clearTimeout(timeout))
  }, [])

  useEffect(() => {
    if (!currentUser) return
    setLoading(true)
    setError(null)
    setServerDown(false)

    const controller = new AbortController()
    // Longer than the service worker's own 4s networkTimeoutSeconds, so it
    // always gets a chance to fall back to cache before we abort the request.
    const timeout = setTimeout(() => controller.abort(), 8000)

    Promise.all([
      fetch(`${API_BASE}/api/exercises?user_id=${currentUser.id}`, { signal: controller.signal }).then((res) => {
        if (!res.ok) throw new Error('Failed to load exercises')
        return res.json()
      }),
      fetch(`${API_BASE}/api/day-plans?user_id=${currentUser.id}`, { signal: controller.signal }).then((r) => r.ok ? r.json() : []),
    ])
      .then(([exercisesData, plans]) => {
        // Reapply any still-unsent edits on top of the fetched data — if we're
        // offline, this response may be a stale cached one predating the edit.
        const merged = exercisesData.map((item) => {
          const pending = pendingEditsRef.current.get(item.id)
          return pending ? { ...item, ...pending.updates } : item
        })
        setAllExercises(merged)
        setDaysWithWorkouts(new Set(merged.map((e) => e.day)))
        const titlesMap = new Map(plans.map((p) => [p.day, p.title]))
        setDayTitles(titlesMap)
      })
      .catch((err) => {
        if (err.name === 'AbortError' || err.name === 'TypeError') {
          setServerDown(true)
        } else {
          setError(err.message)
        }
      })
      .finally(() => {
        clearTimeout(timeout)
        setLoading(false)
      })
  }, [currentUser, exercisesRefreshKey])

  useEffect(() => {
    if (!currentUser) return
    const controller = new AbortController()
    fetch(`${API_BASE}/api/workout-log/history?user_id=${currentUser.id}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then(setWorkoutLog)
      .catch(() => {})
    return () => controller.abort()
  }, [currentUser, workoutLogRefreshKey])

  // Only used to pick the muscle-diagram model (male/female) on a workout
  // card — not worth lifting the rest of the profile up here too, since
  // nothing else on this screen needs it.
  useEffect(() => {
    if (!currentUser) return
    const controller = new AbortController()
    fetch(`${API_BASE}/api/profile?user_id=${currentUser.id}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUserSex(data?.sex || null))
      .catch(() => {})
    return () => controller.abort()
  }, [currentUser])

  useEffect(() => {
    if (!currentUser || !historyDate) {
      setHistoryEntries([])
      return
    }
    const controller = new AbortController()
    setHistoryLoading(true)
    fetch(`${API_BASE}/api/workout-log/day?user_id=${currentUser.id}&date=${historyDate}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then(setHistoryEntries)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
    return () => controller.abort()
  }, [currentUser, historyDate])

  useEffect(() => {
    if (!currentUser) return
    const controller = new AbortController()
    fetch(`${API_BASE}/api/workout-log/streak?user_id=${currentUser.id}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setStreak(data) })
      .catch(() => {})
    return () => controller.abort()
  }, [currentUser, workoutLogRefreshKey])

  // Runs the flare for a fixed 1s regardless of what happens afterward — once
  // started (by a streak tick-up or a hover), it always plays out in full;
  // hover is just a trigger, not something that can cut it short by leaving.
  function triggerFlameFlare() {
    if (flameTimeoutRef.current) clearTimeout(flameTimeoutRef.current)
    setFlameAnimating(true)
    flameTimeoutRef.current = setTimeout(() => {
      setFlameAnimating(false)
      flameTimeoutRef.current = null
    }, 1000)
  }

  // "Rekindle" flare: fires once, briefly, whenever the streak ticks up while
  // sitting at (or just reaching) its all-time best — not continuous, not on
  // every load, only on that specific upward tick.
  useEffect(() => {
    const prev = prevStreakRef.current
    prevStreakRef.current = streak.current_streak
    if (streak.current_streak > prev && streak.current_streak === streak.longest_streak) {
      triggerFlameFlare()
    }
  }, [streak.current_streak, streak.longest_streak])

  // Keeps a running snapshot of completedExerciseIds from the last render
  // where the day *wasn't* fully complete yet — so the moment it flips to
  // complete, this still holds the "just before" state to diff against.
  useEffect(() => {
    if (exercises.length === 0) return
    if (!exercises.every((item) => completedExerciseIds.has(item.id))) {
      preCompletionSnapshotRef.current = completedExerciseIds
    }
  }, [completedExerciseIds, exercises])

  useEffect(() => {
    if (!currentUser || historyDate || selectedDay !== today || exercises.length === 0) return
    if (!exercises.every((item) => completedExerciseIds.has(item.id))) return

    const todayISO = toISODate(new Date())
    // Completing a surfaced catch-up workout resolves *its* original scheduled
    // date (marked performed today, i.e. late) rather than today's date — today
    // was never actually scheduled in this case.
    const scheduledDate = isShowingCatchUp ? pendingCatchUp.scheduled_date : todayISO
    const oldStreak = streak.current_streak
    // The ids that just flipped complete this round — either the whole cascade
    // batch (diffed against the snapshot frozen when the button was clicked) or
    // the single card whose swipe finished the day.
    const baseline = cascadeStartSnapshotRef.current ?? preCompletionSnapshotRef.current
    const batchIds = exercises
      .filter((item) => !baseline.has(item.id))
      .map((item) => item.id)
    cascadeStartSnapshotRef.current = null
    fetch(`${API_BASE}/api/workout-log/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, scheduled_date: scheduledDate, performed_date: todayISO }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (!result) return
        setWorkoutLogRefreshKey((k) => k + 1)
        setLastCompletionBatch({ ids: batchIds, scheduledDate })
        setCelebration({
          message: WORKOUT_COMPLETE_MESSAGES[Math.floor(Math.random() * WORKOUT_COMPLETE_MESSAGES.length)],
          oldStreak,
          newStreak: result.current_streak,
          isNewBest: result.current_streak === result.longest_streak,
        })
      })
      .catch(() => {})
    // Deliberately excludes `streak` — it's only read to snapshot the
    // pre-completion value at the moment this fires, not to react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedExerciseIds, exercises, selectedDay, currentUser, isShowingCatchUp, pendingCatchUp, historyDate])

  function handleUndoComplete() {
    if (!lastCompletionBatch || !currentUser) return
    const { ids, scheduledDate } = lastCompletionBatch
    const oldStreak = streak.current_streak
    fetch(`${API_BASE}/api/workout-log/uncomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, scheduled_date: scheduledDate }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (!result) return
        setCompletedExerciseIds((current) => {
          const next = new Set(current)
          ids.forEach((id) => next.delete(id))
          return next
        })
        ids.forEach((id) => recordExerciseCompletion(id, false))
        // See toggleCompleted's comment — leaving this non-zero would replay
        // the cascade on a future remount (e.g. Settings and back).
        setCascadeToken(0)
        setStreak(result)
        setLastCompletionBatch(null)
        setWorkoutLogRefreshKey((k) => k + 1)
        setCelebration(null)
        // Briefly flags just the reverted cards so they play a fade instead of
        // snapping straight to their uncompleted look.
        setJustRevertedIds(new Set(ids))
        setTimeout(() => setJustRevertedIds(new Set()), 450)
        // Header streak number normally just silently updates behind the
        // celebration overlay on a real completion — undo has no overlay to
        // hide behind, so it plays its own little tick-down roll instead.
        if (result.current_streak !== oldStreak) {
          setStreakUndoTick({ from: oldStreak, to: result.current_streak })
          setTimeout(() => setStreakUndoTick(null), 500)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!planMenuOpen) return

    function handleClickOutside(e) {
      if (planMenuRef.current && !planMenuRef.current.contains(e.target)) {
        closePlanMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [planMenuOpen])

  useEffect(() => {
    if (!musicPanelOpen) return

    function handleClickOutside(e) {
      if (
        musicButtonRef.current && !musicButtonRef.current.contains(e.target) &&
        musicPanelElRef.current && !musicPanelElRef.current.contains(e.target)
      ) {
        setMusicPanelOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [musicPanelOpen])

  // Remove-mode is only ever entered via the long-press below — closing the
  // panel any other way (click-outside, a plain tap) should always drop
  // back to it, so it never carries over into a later, freshly-opened panel.
  useEffect(() => {
    if (!musicPanelOpen) setMusicPanelRemoveMode(false)
  }, [musicPanelOpen])

  function toggleMusicPanel() {
    if (musicLongPressFiredRef.current) {
      // The pointerup that follows a long-press also fires a click — this
      // swallows that one so it doesn't immediately re-toggle what the
      // long-press just opened.
      musicLongPressFiredRef.current = false
      return
    }
    setMusicPanelRemoveMode(false)
    setMusicPanelOpen((open) => !open)
  }

  // No native "long press" event exists — this is the standard DIY version:
  // a timer started on pointerdown, cancelled on pointerup/leave/cancel.
  // Scoped to touch/pen only (pointerType check) since desktop already has
  // its own removal affordance (hover-to-reveal the small X on each cell).
  function handleMusicPointerDown(e) {
    if (e.pointerType === 'mouse') return
    musicLongPressFiredRef.current = false
    musicLongPressTimerRef.current = setTimeout(() => {
      musicLongPressFiredRef.current = true
      setMusicPanelRemoveMode(true)
      setMusicPanelOpen(true)
    }, 500)
  }

  function cancelMusicLongPress() {
    clearTimeout(musicLongPressTimerRef.current)
  }

  function closePlanMenu() {
    setPlanMenuOpen(false)
    setPlanMenuScreen('root')
  }

  function openWeekDays() {
    setPlanView('week')
    setPlanMenuScreen('days')
  }

  function openMonthView() {
    setPlanView('month')
    setCalendarMonth(new Date())
    setPlanMenuScreen('month')
  }

  function shiftMonth(delta) {
    setCalendarMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + delta, 1)
      if (delta < 0 && next < earliestCalendarMonth) return current
      return next
    })
  }

  // Weekday picker: resolves "Monday" to its most recent actual date. Today
  // or a day that hasn't happened yet this week shows the live plan, same as
  // before; an already-passed occurrence shows that date's history instead.
  function selectWeekday(day) {
    const todayISO = toISODate(new Date())
    const occurrence = mostRecentOccurrenceISO(day, todayISO)
    setSelectedDay(day)
    setHistoryDate(occurrence < todayISO ? occurrence : null)
    closePlanMenu()
  }

  // Month view: an explicit date, so today/future always means live, and any
  // past date always means history — no "most recent occurrence" ambiguity.
  function selectMonthDay(date) {
    const iso = toISODate(date)
    const todayISO = toISODate(new Date())
    setSelectedDay(weekdayNameFromISO(iso))
    setHistoryDate(iso < todayISO ? iso : null)
    closePlanMenu()
  }

  function viewCurrentPlan() {
    setHistoryDate(null)
  }

  function markEditPending(id, updates, changedFields) {
    setPendingEdits((current) => {
      const next = new Map(current)
      const existing = current.get(id)
      const mergedFields = existing
        ? Array.from(new Set([...existing.changedFields, ...changedFields]))
        : changedFields
      next.set(id, { updates, changedFields: mergedFields })
      persistPending(next)
      return next
    })
  }

  function updateExercise(id, updates, changedFields = []) {
    setAllExercises((current) =>
      current.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    )

    if (isOffline) {
      markEditPending(id, updates, changedFields)
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)

    fetch(`${API_BASE}/api/exercises/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to save')
        setPendingEdits((current) => {
          if (!current.has(id)) return current
          const next = new Map(current)
          next.delete(id)
          persistPending(next)
          return next
        })
      })
      .catch(() => {
        markEditPending(id, updates, changedFields)
      })
      .finally(() => clearTimeout(timeout))
  }

  function swapExercise(id, reason, otherText) {
    return fetch(`${API_BASE}/api/exercises/${id}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, other_text: otherText }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((updated) => {
        if (!updated) return
        setAllExercises((current) =>
          current.map((item) => (item.id === id ? updated : item)),
        )
      })
      .catch(() => {})
  }

  function updateExerciseFromChat(updated) {
    setAllExercises((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    )
  }

  const [planGenerating, setPlanGenerating] = useState(false)
  const [planPhase, setPlanPhase] = useState('thinking')
  const [planStructure, setPlanStructure] = useState(null)
  const [regenOpen, setRegenOpen] = useState(false)
  const [settingsClosing, setSettingsClosing] = useState(false)
  const [settingsOpening, setSettingsOpening] = useState(false)
  const [chatExercise, setChatExercise] = useState(null)
  const [chatReturnExerciseId, setChatReturnExerciseId] = useState(null)
  const chatScrollYRef = useRef(0)
  const [timerExercise, setTimerExercise] = useState(null)
  const [timerReturnExerciseId, setTimerReturnExerciseId] = useState(null)
  const timerScrollYRef = useRef(0)

  function openChat(exercise) {
    chatScrollYRef.current = window.scrollY
    setChatExercise(exercise)
    setView('chat')
    window.history.pushState({ view: 'chat' }, '')
  }

  function closeChat() {
    setChatReturnExerciseId(chatExercise?.id ?? null)
    setView('home')
    setChatExercise(null)
  }

  useEffect(() => {
    if (view !== 'home' || chatReturnExerciseId == null) return
    window.scrollTo(0, chatScrollYRef.current)
    setChatReturnExerciseId(null)
  }, [view, chatReturnExerciseId])

  function openTimer(exercise) {
    timerScrollYRef.current = window.scrollY
    setTimerExercise(exercise)
    setView('timer')
    window.history.pushState({ view: 'timer' }, '')
  }

  function closeTimer() {
    setTimerReturnExerciseId(timerExercise?.id ?? null)
    setView('home')
    setTimerExercise(null)
  }

  useEffect(() => {
    if (view !== 'home' || timerReturnExerciseId == null) return
    window.scrollTo(0, timerScrollYRef.current)
    setTimerReturnExerciseId(null)
  }, [view, timerReturnExerciseId])

  // Lets the Android back button (and back gesture) close whichever full-screen
  // view is open instead of exiting the app — the open* functions above push a
  // history entry, and the close buttons below go through history.back() so
  // both paths converge here.
  useEffect(() => {
    function handlePopState() {
      if (view === 'chat') closeChat()
      else if (view === 'timer') closeTimer()
      else if (view === 'settings') closeSettings()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [view, chatExercise, timerExercise])

  // Triggered from Edit Plan's Generate menu (see onRegeneratePlan below) via
  // RegeneratePlanModal's confirm step. Closes both the modal and Edit Plan
  // itself the moment generation starts — Edit Plan's draft is a one-time
  // snapshot of allExercises taken at mount, so it'd go stale mid-regenerate
  // rather than reflecting the wipe-and-rebuild happening underneath it.
  async function handleGenerate(settings) {
    setRegenOpen(false)
    setView('settings')
    setPlanPhase('thinking')
    setPlanGenerating(true)
    setPlanStructure(null)

    try {
      const res = await fetch(`${API_BASE}/api/plan/structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          days_per_week: settings.daysPerWeek,
          start_day: settings.startDay,
          beginner_mode: settings.beginner,
          include_warm_up: settings.includeWarmUp,
          include_stretch: settings.includeStretch,
        }),
      })
      if (!res.ok) throw new Error('Plan structure failed')
      const { days } = await res.json()

      const structure = days.map((d) => ({ ...d, completed: 0, done: false }))
      setPlanStructure(structure)
      setPlanPhase('generating')

      await Promise.all(
        structure.map((dayPlan, dayIndex) =>
          Promise.all(
            dayPlan.exercises.map(async (exerciseName) => {
              await fetch(`${API_BASE}/api/exercises/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: exerciseName, day: dayPlan.day, user_id: currentUser.id }),
              })
              setPlanStructure((prev) =>
                prev.map((d, i) =>
                  i === dayIndex
                    ? { ...d, completed: d.completed + 1, done: d.completed + 1 >= d.exercises.length }
                    : d,
                ),
              )
            }),
          ),
        ),
      )
    } catch (err) {
      console.error('Plan generation failed', err)
    } finally {
      setPlanGenerating(false)
      setExercisesRefreshKey((k) => k + 1)
    }
  }

  function closeSettings() {
    setSettingsClosing(true)
    setTimeout(() => setSettingsClosing(false), 400)
    setView('home')
  }

  function toggleSettings(e) {
    if (view === 'settings') {
      e.currentTarget.blur()
      window.history.back()
    } else {
      setSettingsOpening(true)
      setTimeout(() => setSettingsOpening(false), 350)
      setView('settings')
      window.history.pushState({ view: 'settings' }, '')
    }
  }

  return (
    <div className={`page ${view === 'chat' ? 'is-chat' : ''} ${view === 'timer' ? 'is-timer' : ''} ${view === 'editPlan' ? 'is-edit-plan' : ''}`} ref={pageRef}>
      {view !== 'editPlan' && (
      <header className="page-header">
        {view === 'chat' || view === 'timer' || view === 'workoutProfile' ? (
          <>
            <button
              type="button"
              className="chat-back-btn"
              onClick={() => (view === 'workoutProfile' ? setView('settings') : window.history.back())}
              aria-label="Back"
            >
              <ChevronLeftIcon size={20} />
            </button>
            <div className="plan-picker">
              <span className="today is-static">
                {view === 'timer' ? timerExercise?.name : view === 'workoutProfile' ? 'User Workout Profile' : chatExercise?.name}
              </span>
            </div>
          </>
        ) : (
          <>
        <Logo height={64} className="page-logo" />

        {view === 'settings' ? (
          <div className="plan-picker">
            <span className="today is-static">Settings</span>
          </div>
        ) : (
          <div className="plan-picker" ref={planMenuRef}>
            {isOffline && !serverDown && (
              <span className="offline-indicator" title="Offline — showing cached data">
                <OfflineIcon size={30} />
              </span>
            )}
            <button
              type="button"
              className="today"
              onClick={() => setPlanMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={planMenuOpen}
            >
              <span className="today-main">
                {selectedDay}
                {isShowingCatchUp && (
                  <span className="catchup-dot" title={catchUpTooltipText} aria-label={catchUpTooltipText} />
                )}
              </span>
              {isShowingCatchUp ? (
                <span className="today-subtitle catchup-mobile-label">{catchUpTooltipText}</span>
              ) : historyDate ? (
                <span className="today-subtitle">{formatHistoryDate(historyDate)}</span>
              ) : dayTitles.get(selectedDay) && (
                <span className="today-subtitle">{dayTitles.get(selectedDay)}</span>
              )}
            </button>

            {planMenuOpen && planMenuScreen === 'root' && (
              <div className="plan-menu" role="menu">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={planView === 'week'}
                  className="plan-menu-option is-view-toggle"
                  onClick={openWeekDays}
                >
                  Week
                  <TableIcon size={18} />
                </button>
                <div className="plan-menu-separator" />
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={planView === 'month'}
                  className="plan-menu-option is-view-toggle"
                  onClick={openMonthView}
                >
                  Month
                  <CalendarIcon size={18} />
                </button>
              </div>
            )}

            {planMenuOpen && planMenuScreen === 'month' && (
              <div className="plan-menu plan-menu-month" role="menu">
                <button
                  type="button"
                  className="plan-menu-back"
                  onClick={() => setPlanMenuScreen('root')}
                  aria-label="Back to week/month picker"
                >
                  <ChevronLeftIcon size={16} />
                </button>

                <div className="month-nav-header">
                  <button
                    type="button"
                    className="month-nav-btn"
                    onClick={() => shiftMonth(-1)}
                    disabled={isPrevMonthDisabled}
                    aria-label="Previous month"
                  >
                    <ChevronLeftIcon size={16} />
                  </button>
                  <span className="month-nav-label">
                    {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    className="month-nav-btn is-next"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                  >
                    <ChevronLeftIcon size={16} />
                  </button>
                </div>

                <div className="month-grid">
                  {(() => {
                    const weeks = getMonthGridWeeks(calendarMonth)
                    const lastRowLine = weeks.length + 2
                    return (
                      <>
                        {weekdays.map((day, index) =>
                          daysWithWorkouts.has(day) ? (
                            <div
                              key={`bg-${day}`}
                              className="month-grid-column-bg"
                              style={{ gridColumn: index + 1, gridRow: `1 / ${lastRowLine}` }}
                              aria-hidden="true"
                            />
                          ) : null,
                        )}
                        {weekdays.map((day, index) => (
                          <span
                            key={day}
                            className={`month-grid-weekday ${daysWithWorkouts.has(day) ? 'has-workout' : ''}`}
                            style={{ gridColumn: index + 1, gridRow: 1 }}
                          >
                            {day.slice(0, 3)}
                          </span>
                        ))}
                        {weeks.flatMap((week, weekIndex) =>
                          week.map((cell, cellIndex) => {
                            const gridColumn = cellIndex + 1
                            const gridRow = weekIndex + 2
                            if (!cell) return <span key={`${weekIndex}-${cellIndex}`} className="month-grid-day is-blank" style={{ gridColumn, gridRow }} />
                            const isToday = cell.date.toDateString() === new Date().toDateString()
                            const indicator = workoutIndicators.get(toISODate(cell.date))
                            return (
                              <button
                                type="button"
                                key={`${weekIndex}-${cellIndex}`}
                                className={`month-grid-day ${isToday ? 'is-today' : ''}`}
                                style={{ gridColumn, gridRow }}
                                onClick={() => selectMonthDay(cell.date)}
                              >
                                <span className="month-grid-day-num">{cell.day}</span>
                                <span className={`month-grid-day-dot ${indicator ? `is-${indicator}` : 'is-empty'}`} aria-hidden="true" />
                              </button>
                            )
                          }),
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            {planMenuOpen && planMenuScreen === 'days' && (
              <div className="plan-menu" role="menu">
                <button
                  type="button"
                  className="plan-menu-back"
                  onClick={() => setPlanMenuScreen('root')}
                  aria-label="Back to week/month picker"
                >
                  <ChevronLeftIcon size={16} />
                </button>
                {weekdays.map((day, index) => (
                  <Fragment key={day}>
                    {index > 0 && <div className="plan-menu-separator" />}
                    <button
                      type="button"
                      role="menuitem"
                      aria-checked={day === selectedDay}
                      className={`plan-menu-option ${day === today ? 'is-today' : ''} ${day === selectedDay ? 'is-picked-day' : ''} ${day !== today && !daysWithWorkouts.has(day) ? 'is-empty-day' : ''}`}
                      onClick={() => selectWeekday(day)}
                    >
                      {day}
                    </button>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="header-actions">
          {view !== 'settings' && musicProvider !== 'none' && (
            <div className="music-provider-picker">
              <button
                type="button"
                ref={musicButtonRef}
                className={`music-provider-btn ${musicPanelOpen ? 'is-active' : ''}`}
                onClick={toggleMusicPanel}
                onPointerDown={handleMusicPointerDown}
                onPointerUp={cancelMusicLongPress}
                onPointerLeave={cancelMusicLongPress}
                onPointerCancel={cancelMusicLongPress}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="Music provider"
                aria-expanded={musicPanelOpen}
              >
                <MusicProviderIcon provider={musicProvider} size={28} />
              </button>

              {musicPanelOpen && (
                <MusicProviderPanel
                  userId={currentUser?.id}
                  provider={musicProvider}
                  panelRef={musicPanelElRef}
                  anchorRef={musicButtonRef}
                  boundsRef={pageRef}
                  removeMode={musicPanelRemoveMode}
                />
              )}
            </div>
          )}
          {view !== 'settings' && (
            <div
              className={`streak-badge ${!streak.current_streak ? 'is-inactive' : ''}`}
              title={streak.current_streak ? `${streak.current_streak}-day streak` : 'No active streak'}
              onMouseEnter={() => {
                if (streak.current_streak > 0 && streak.current_streak === streak.longest_streak) triggerFlameFlare()
              }}
            >
              {streakUndoTick ? (
                <span className="streak-number-viewport">
                  <span className="streak-number-roll is-tick-down">
                    <span className="streak-number streak-number-digit">{streakUndoTick.to}</span>
                    <span className="streak-number streak-number-digit">{streakUndoTick.from}</span>
                  </span>
                </span>
              ) : (
                <span className="streak-number">{streak.current_streak || 0}</span>
              )}
              <FlameIcon size={26} className={`streak-flame ${flameAnimating ? 'is-flaring' : ''}`} />
            </div>
          )}

          <button
            type="button"
            className={`settings-btn ${view === 'settings' ? 'is-active' : ''} ${settingsClosing ? 'is-closing' : ''} ${settingsOpening ? 'is-opening' : ''}`}
            onClick={toggleSettings}
            aria-label="Settings"
            aria-pressed={view === 'settings'}
          >
            <GearIcon size={28} />
          </button>
        </div>
          </>
        )}
      </header>
      )}

      <div key={view} className="view-content">
        {view === 'chat' ? (
          <ChatView exercise={chatExercise} isOffline={isOffline} onExerciseUpdated={updateExerciseFromChat} />
        ) : view === 'timer' ? (
          <TimerView
            exercise={timerExercise}
            onComplete={() => {
              markCompleted(timerExercise.id)
              window.history.back()
            }}
          />
        ) : view === 'settings' ? (
          <SettingsPage
            themeMode={themeMode}
            onChangeThemeMode={setThemeMode}
            onChangeBeginnerMode={(val) => {
              setBeginnerMode(val)
              localStorage.setItem(BEGINNER_MODE_STORAGE_KEY, String(val))
            }}
            onEditPlan={() => setView('editPlan')}
            onEditProfile={() => setView('workoutProfile')}
            musicProvider={musicProvider}
            onChangeMusicProvider={(id) => {
              setMusicProvider(id)
              localStorage.setItem(MUSIC_PROVIDER_STORAGE_KEY, id)
            }}
            version={APP_VERSION}
            isOffline={isOffline}
            users={users}
            currentUser={currentUser}
            onChangeUser={(user) => {
              setCurrentUser(user)
              localStorage.setItem(CURRENT_USER_STORAGE_KEY, String(user.id))
            }}
            flashStreakFreeze={settingsFlashToken}
            onStreakFreezeChange={() => setWorkoutLogRefreshKey((k) => k + 1)}
          />
        ) : view === 'workoutProfile' ? (
          <WorkoutProfilePage
            beginnerMode={beginnerMode}
            onChangeBeginnerMode={(val) => {
              setBeginnerMode(val)
              localStorage.setItem(BEGINNER_MODE_STORAGE_KEY, String(val))
            }}
            isOffline={isOffline}
            currentUser={currentUser}
          />
        ) : view === 'editPlan' ? (
          <EditPlanView
            allExercises={allExercises}
            dayTitles={dayTitles}
            userId={currentUser?.id}
            onSaved={() => setExercisesRefreshKey((k) => k + 1)}
            onDayTitleSaved={(day, title) => setDayTitles((prev) => new Map(prev).set(day, title))}
            onClose={() => setView('settings')}
            onRegeneratePlan={() => setRegenOpen(true)}
          />
        ) : (
          <main className="card-list">
            {historyDate ? (
              <>
                <button type="button" className="view-current-plan-btn" onClick={viewCurrentPlan}>
                  View current plan
                </button>
                {historyLoading && <p className="loading-message">Loading history...</p>}
                {!historyLoading && historyEntries.length === 0 && (
                  <div className="empty-day">
                    <ZzzIcon className="empty-day-zzz" />
                    <p className="empty-day-message">Nothing recorded for this day.</p>
                  </div>
                )}
                {!historyLoading && historyEntries.map((entry) => (
                  <HistoryWorkoutCard key={entry.exercise_id ?? entry.name} entry={entry} />
                ))}
              </>
            ) : (
              <>
            {loading && <p className="loading-message">Loading exercises...</p>}
            {!loading && serverDown && (
              <div className="empty-day">
                <PlugOffIcon className="empty-day-zzz" size={80} />
                <p className="empty-day-message">
                  The server isn't responding.<br />This might be your lucky day!
                </p>
              </div>
            )}
            {!loading && !serverDown && showFreezeScreen && (
              <StreakFreezeNotice
                untilDate={streak.streak_freeze_until}
                onSuspend={suspendStreakFreezeNotice}
                onDeactivate={() => {
                  setSettingsFlashToken((t) => t + 1)
                  setView('settings')
                }}
              />
            )}
            {!loading && !serverDown && !showFreezeScreen && error && <p className="status-message">Couldn't load exercises: {error}</p>}
            {!loading && !serverDown && !showFreezeScreen && !error && exercises.length === 0 && (
              <div className="empty-day">
                <ZzzIcon className="empty-day-zzz" />
                <p className="empty-day-message">
                  This seems to be a rest day... Feeling a bit enthusiastic, are we?
                </p>
              </div>
            )}
            {!loading &&
              !serverDown &&
              !showFreezeScreen &&
              !error &&
              exercises.map((item, index) => (
                <WorkoutCard
                  key={item.id}
                  exercise={item.name}
                  sets={item.sets}
                  reps={item.reps}
                  weight={item.weight}
                  description={item.description}
                  bullets={item.bullets}
                  adjustments={item.adjustments}
                  videoId={item.video_id}
                  duration={item.duration}
                  category={item.category}
                  photo={item.photo}
                  muscles={item.muscles}
                  sex={userSex}
                  isOffline={isOffline}
                  pendingFields={pendingEdits.get(item.id)?.changedFields ?? []}
                  initiallyExpanded={item.id === chatReturnExerciseId}
                  onSave={(updates, changedFields) => updateExercise(item.id, updates, changedFields)}
                  onSwap={(reason, otherText) => swapExercise(item.id, reason, otherText)}
                  onChat={() => openChat(item)}
                  onOpenTimer={() => openTimer(item)}
                  completed={completedExerciseIds.has(item.id)}
                  onToggleComplete={() => toggleCompleted(item.id)}
                  isReverting={justRevertedIds.has(item.id)}
                  cascadeToken={cascadeToken}
                  cascadeIndex={index}
                />
              ))}
            {!loading && !serverDown && !showFreezeScreen && !error && exercises.length > 0 && (() => {
              const allComplete = exercises.every((item) => completedExerciseIds.has(item.id))
              const currentScheduledDate = isShowingCatchUp ? pendingCatchUp.scheduled_date : toISODate(new Date())
              const canUndo = allComplete
                && selectedDay === today
                && lastCompletionBatch?.scheduledDate === currentScheduledDate
                && lastCompletionBatch.ids.length > 0
              return (
                <div className="workout-actions">
                  {canUndo && (
                    <button
                      type="button"
                      className="workout-undo-btn"
                      onClick={handleUndoComplete}
                      aria-label="Undo completing workout"
                      title="Undo completing workout"
                    >
                      <UndoIcon size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="complete-workout-btn"
                    onClick={() => {
                      cascadeStartSnapshotRef.current = new Set(completedExerciseIds)
                      setCascadeToken((t) => t + 1)
                    }}
                    disabled={allComplete}
                  >
                    <CheckAllIcon size={20} />
                    Complete Workout
                  </button>
                </div>
              )
            })()}
              </>
            )}
          </main>
        )}
      </div>

      {view !== 'editPlan' && (
      <footer className="page-footer">
        <span>{APP_VERSION}</span>
        <a
          className="report-bug-link"
          href={REPORT_BUG_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Report a bug"
        >
          <BugIcon size={21} />
          Report bug
        </a>
      </footer>
      )}


      {regenOpen && (
        <RegeneratePlanModal
          beginnerMode={beginnerMode}
          onClose={() => setRegenOpen(false)}
          onGenerate={handleGenerate}
          onBeginnerChange={(val) => {
            setBeginnerMode(val)
            localStorage.setItem(BEGINNER_MODE_STORAGE_KEY, String(val))
          }}
        />
      )}

      {planGenerating && (
        <PlanGeneratingOverlay
          phase={planPhase}
          planStructure={planStructure}
        />
      )}

      {celebration && (
        <WorkoutCompleteCelebration
          message={celebration.message}
          oldStreak={celebration.oldStreak}
          newStreak={celebration.newStreak}
          isNewBest={celebration.isNewBest}
          onDone={() => setCelebration(null)}
        />
      )}
    </div>
  )
}

export default App
