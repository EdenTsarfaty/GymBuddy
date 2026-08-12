import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import ChatView from './components/ChatView'
import WorkoutCard from './components/WorkoutCard'
import Logo from './components/Logo'
import SettingsPage from './components/SettingsPage'
import BugIcon from './components/icons/BugIcon'
import CalendarIcon from './components/icons/CalendarIcon'
import OfflineIcon from './components/icons/OfflineIcon'
import ChevronLeftIcon from './components/icons/ChevronLeftIcon'
import GearIcon from './components/icons/GearIcon'
import PlugOffIcon from './components/icons/PlugOffIcon'
import RegeneratePlanModal from './components/RegeneratePlanModal'
import PlanGeneratingOverlay from './components/PlanGeneratingOverlay'
import TableIcon from './components/icons/TableIcon'
import ZzzIcon from './components/icons/ZzzIcon'
import './App.css'

const APP_VERSION = 'beta 0.5.6'
const THEME_MODE_STORAGE_KEY = 'gymbuddy-theme-mode'
const BEGINNER_MODE_STORAGE_KEY = 'gymbuddy-beginner-mode'
const CURRENT_USER_STORAGE_KEY = 'gymbuddy-current-user-id'
const PENDING_EDITS_STORAGE_KEY = 'gymbuddy-pending-edits'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'
const REPORT_BUG_URL = `https://t.me/Azsper?text=${encodeURIComponent('Hey! I found a bug in GymBuddy — ')}`

const CATEGORY_ORDER = { warm_up: 0, stretch: 2 }
function categoryRank(category) {
  return CATEGORY_ORDER[category] ?? 1
}

const today = new Date().toLocaleDateString(undefined, { weekday: 'long' })

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

function getInitialBeginnerMode() {
  return localStorage.getItem(BEGINNER_MODE_STORAGE_KEY) === 'true'
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
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(getInitialThemeMode()))
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [allExercises, setAllExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [serverDown, setServerDown] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [planMenuOpen, setPlanMenuOpen] = useState(false)
  const [planMenuScreen, setPlanMenuScreen] = useState('root')
  const [planView, setPlanView] = useState('week')
  const [selectedDay, setSelectedDay] = useState(today)
  const [daysWithWorkouts, setDaysWithWorkouts] = useState(new Set())
  const [dayTitles, setDayTitles] = useState(new Map())
  const [exercisesRefreshKey, setExercisesRefreshKey] = useState(0)
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

  const exercises = useMemo(
    () => allExercises
      .filter((item) => item.day === selectedDay)
      .sort((a, b) => categoryRank(a.category) - categoryRank(b.category)),
    [allExercises, selectedDay],
  )

  useEffect(() => {
    let cancelled = false

    function checkHealth() {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      fetch(`${API_BASE}/api/health`, { signal: controller.signal, cache: 'no-store' })
        .then((res) => {
          if (cancelled) return
          setIsOffline(!res.ok)
          if (res.ok && pendingEditsRef.current.size > 0) flushPendingEdits()
        })
        .catch(() => { if (!cancelled) setIsOffline(true) })
        .finally(() => clearTimeout(timeout))
    }

    checkHealth()
    const interval = setInterval(checkHealth, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
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
    if (!planMenuOpen) return

    function handleClickOutside(e) {
      if (planMenuRef.current && !planMenuRef.current.contains(e.target)) {
        closePlanMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [planMenuOpen])

  function closePlanMenu() {
    setPlanMenuOpen(false)
    setPlanMenuScreen('root')
  }

  function openWeekDays() {
    setPlanView('week')
    setPlanMenuScreen('days')
  }

  function selectDay(day) {
    setSelectedDay(day)
    closePlanMenu()
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

  const [regenOpen, setRegenOpen] = useState(false)
  const [planGenerating, setPlanGenerating] = useState(false)
  const [planPhase, setPlanPhase] = useState('thinking')
  const [planStructure, setPlanStructure] = useState(null)
  const [settingsClosing, setSettingsClosing] = useState(false)
  const [settingsOpening, setSettingsOpening] = useState(false)
  const [chatExercise, setChatExercise] = useState(null)
  const [chatReturnExerciseId, setChatReturnExerciseId] = useState(null)
  const chatScrollYRef = useRef(0)

  function openChat(exercise) {
    chatScrollYRef.current = window.scrollY
    setChatExercise(exercise)
    setView('chat')
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

  async function handleGenerate(settings) {
    setRegenOpen(false)
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

  function toggleSettings(e) {
    if (view === 'settings') {
      e.currentTarget.blur()
      setSettingsClosing(true)
      setTimeout(() => setSettingsClosing(false), 400)
    } else {
      setSettingsOpening(true)
      setTimeout(() => setSettingsOpening(false), 350)
    }
    setView((current) => (current === 'settings' ? 'home' : 'settings'))
  }

  return (
    <div className={`page ${view === 'chat' ? 'is-chat' : ''}`}>
      <header className="page-header">
        {view === 'chat' ? (
          <>
            <button
              type="button"
              className="chat-back-btn"
              onClick={closeChat}
              aria-label="Back to workout"
            >
              <ChevronLeftIcon size={20} />
            </button>
            <div className="plan-picker">
              <span className="today is-static">{chatExercise?.name}</span>
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
              </span>
              {dayTitles.get(selectedDay) && (
                <span className="today-subtitle">{dayTitles.get(selectedDay)}</span>
              )}
            </button>

            {planMenuOpen && planMenuScreen === 'root' && (
              <div className="plan-menu" role="menu">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={planView === 'week'}
                  className={`plan-menu-option ${planView === 'week' ? 'is-selected' : ''}`}
                  onClick={openWeekDays}
                >
                  Week
                  <TableIcon size={16} />
                </button>
                <div className="plan-menu-separator" />
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={false}
                  className="plan-menu-option"
                  disabled
                  title="Coming soon"
                >
                  Month
                  <CalendarIcon size={16} />
                </button>
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
                      onClick={() => selectDay(day)}
                    >
                      {day}
                    </button>
                  </Fragment>
                ))}
              </div>
            )}
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
          </>
        )}
      </header>

      <div key={view} className="view-content">
        {view === 'chat' ? (
          <ChatView exercise={chatExercise} isOffline={isOffline} onExerciseUpdated={updateExerciseFromChat} />
        ) : view === 'settings' ? (
          <SettingsPage
            themeMode={themeMode}
            onChangeThemeMode={setThemeMode}
            beginnerMode={beginnerMode}
            onChangeBeginnerMode={(val) => {
              setBeginnerMode(val)
              localStorage.setItem(BEGINNER_MODE_STORAGE_KEY, String(val))
            }}
            onRegenerate={() => setRegenOpen(true)}
            version={APP_VERSION}
            isOffline={isOffline}
            users={users}
            currentUser={currentUser}
            onChangeUser={(user) => {
              setCurrentUser(user)
              localStorage.setItem(CURRENT_USER_STORAGE_KEY, String(user.id))
            }}
          />
        ) : (
          <main className="card-list">
            {loading && <p className="loading-message">Loading exercises...</p>}
            {!loading && serverDown && (
              <div className="empty-day">
                <PlugOffIcon className="empty-day-zzz" size={80} />
                <p className="empty-day-message">
                  The server isn't responding.<br />This might be your lucky day!
                </p>
              </div>
            )}
            {!loading && !serverDown && error && <p className="status-message">Couldn't load exercises: {error}</p>}
            {!loading && !serverDown && !error && exercises.length === 0 && (
              <div className="empty-day">
                <ZzzIcon className="empty-day-zzz" />
                <p className="empty-day-message">
                  This seems to be a rest day... Feeling a bit enthusiastic, are we?
                </p>
              </div>
            )}
            {!loading &&
              !serverDown &&
              !error &&
              exercises.map((item) => (
                <WorkoutCard
                  key={item.id}
                  exercise={item.name}
                  sets={item.sets}
                  reps={item.reps}
                  weight={item.weight}
                  description={item.description}
                  bullets={item.bullets}
                  videoId={item.video_id}
                  duration={item.duration}
                  category={item.category}
                  isOffline={isOffline}
                  pendingFields={pendingEdits.get(item.id)?.changedFields ?? []}
                  initiallyExpanded={item.id === chatReturnExerciseId}
                  onSave={(updates, changedFields) => updateExercise(item.id, updates, changedFields)}
                  onSwap={(reason, otherText) => swapExercise(item.id, reason, otherText)}
                  onChat={() => openChat(item)}
                />
              ))}
          </main>
        )}
      </div>

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

      {regenOpen && (
        <RegeneratePlanModal
          beginnerMode={beginnerMode}
          onClose={() => setRegenOpen(false)}
          onGenerate={handleGenerate}
          onBeginnerChange={(val) => {
            setBeginnerMode(val)
            localStorage.setItem(BEGINNER_MODE_STORAGE_KEY, String(val))
            fetch(`${API_BASE}/api/profile`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: currentUser?.id, beginner_mode: val ? 1 : 0 }),
            }).catch(() => {})
          }}
        />
      )}

      {planGenerating && (
        <PlanGeneratingOverlay
          phase={planPhase}
          planStructure={planStructure}
        />
      )}
    </div>
  )
}

export default App
