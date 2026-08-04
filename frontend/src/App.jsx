import { Fragment, useEffect, useRef, useState } from 'react'
import WorkoutCard from './components/WorkoutCard'
import Logo from './components/Logo'
import SettingsPage from './components/SettingsPage'
import CalendarIcon from './components/icons/CalendarIcon'
import ChevronLeftIcon from './components/icons/ChevronLeftIcon'
import GearIcon from './components/icons/GearIcon'
import PlugOffIcon from './components/icons/PlugOffIcon'
import RegeneratePlanModal from './components/RegeneratePlanModal'
import PlanGeneratingOverlay from './components/PlanGeneratingOverlay'
import TableIcon from './components/icons/TableIcon'
import ZzzIcon from './components/icons/ZzzIcon'
import './App.css'

const APP_VERSION = 'beta 0.3.4'
const THEME_MODE_STORAGE_KEY = 'gymbuddy-theme-mode'
const BEGINNER_MODE_STORAGE_KEY = 'gymbuddy-beginner-mode'
const CURRENT_USER_STORAGE_KEY = 'gymbuddy-current-user-id'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

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
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [serverDown, setServerDown] = useState(false)
  const [planMenuOpen, setPlanMenuOpen] = useState(false)
  const [planMenuScreen, setPlanMenuScreen] = useState('root')
  const [planView, setPlanView] = useState('week')
  const [selectedDay, setSelectedDay] = useState(today)
  const [daysWithWorkouts, setDaysWithWorkouts] = useState(new Set())
  const [dayTitles, setDayTitles] = useState(() => {
    try {
      const cached = localStorage.getItem('gymbuddy-day-titles')
      return cached ? new Map(JSON.parse(cached)) : new Map()
    } catch { return new Map() }
  })
  const [exercisesRefreshKey, setExercisesRefreshKey] = useState(0)
  const planMenuRef = useRef(null)

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
    const timeout = setTimeout(() => controller.abort(), 4000)

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
    const timeout = setTimeout(() => controller.abort(), 4000)

    fetch(`${API_BASE}/api/exercises?day=${encodeURIComponent(selectedDay)}&user_id=${currentUser.id}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load exercises')
        return res.json()
      })
      .then(setExercises)
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
  }, [selectedDay, currentUser, exercisesRefreshKey])

  useEffect(() => {
    if (!currentUser) return
    Promise.all([
      fetch(`${API_BASE}/api/exercises?user_id=${currentUser.id}`).then((r) => r.ok ? r.json() : []),
      fetch(`${API_BASE}/api/day-plans?user_id=${currentUser.id}`).then((r) => r.ok ? r.json() : []),
    ]).then(([exercises, plans]) => {
      setDaysWithWorkouts(new Set(exercises.map((e) => e.day)))
      const titlesMap = new Map(plans.map((p) => [p.day, p.title]))
      setDayTitles(titlesMap)
      try { localStorage.setItem('gymbuddy-day-titles', JSON.stringify([...titlesMap])) } catch {}
    }).catch(() => {})
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

  function updateExercise(id, updates) {
    setExercises((current) =>
      current.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    )

    fetch(`${API_BASE}/api/exercises/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
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
        setExercises((current) =>
          current.map((item) => (item.id === id ? updated : item)),
        )
      })
      .catch(() => {})
  }

  const [regenOpen, setRegenOpen] = useState(false)
  const [planGenerating, setPlanGenerating] = useState(false)
  const [planPhase, setPlanPhase] = useState('thinking')
  const [planStructure, setPlanStructure] = useState(null)
  const [settingsClosing, setSettingsClosing] = useState(false)
  const [settingsOpening, setSettingsOpening] = useState(false)

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
    <div className="page">
      <header className="page-header">
        <Logo height={64} className="page-logo" />

        {view === 'settings' ? (
          <div className="plan-picker">
            <span className="today is-static">Settings</span>
          </div>
        ) : (
          <div className="plan-picker" ref={planMenuRef}>
            <button
              type="button"
              className="today"
              onClick={() => setPlanMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={planMenuOpen}
            >
              {selectedDay}
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
      </header>

      <div key={view} className="view-content">
        {view === 'settings' ? (
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
                  weight={item.weight}
                  description={item.description}
                  bullets={item.bullets}
                  videoId={item.video_id}
                  duration={item.duration}
                  category={item.category}
                  onSave={(updates) => updateExercise(item.id, updates)}
                  onSwap={(reason, otherText) => swapExercise(item.id, reason, otherText)}
                />
              ))}
          </main>
        )}
      </div>

      <footer className="page-footer">
        <span>{APP_VERSION}</span>
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
