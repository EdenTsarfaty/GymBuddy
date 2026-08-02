import { Fragment, useEffect, useRef, useState } from 'react'
import WorkoutCard from './components/WorkoutCard'
import Logo from './components/Logo'
import SettingsPage from './components/SettingsPage'
import CalendarIcon from './components/icons/CalendarIcon'
import ChevronLeftIcon from './components/icons/ChevronLeftIcon'
import GearIcon from './components/icons/GearIcon'
import TableIcon from './components/icons/TableIcon'
import ZzzIcon from './components/icons/ZzzIcon'
import './App.css'

const APP_VERSION = 'alpha 0.1.4'
const THEME_MODE_STORAGE_KEY = 'gymbuddy-theme-mode'
const BEGINNER_MODE_STORAGE_KEY = 'gymbuddy-beginner-mode'
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
  const [planMenuOpen, setPlanMenuOpen] = useState(false)
  const [planMenuScreen, setPlanMenuScreen] = useState('root')
  const [planView, setPlanView] = useState('week')
  const [selectedDay, setSelectedDay] = useState(today)
  const [daysWithWorkouts, setDaysWithWorkouts] = useState(new Set())
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
    fetch(`${API_BASE}/api/users`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setUsers(data)
        if (data.length > 0) setCurrentUser(data[0])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!currentUser) return
    setLoading(true)
    setError(null)

    fetch(`${API_BASE}/api/exercises?day=${encodeURIComponent(selectedDay)}&user_id=${currentUser.id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load exercises')
        return res.json()
      })
      .then(setExercises)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [selectedDay, currentUser])

  useEffect(() => {
    if (!currentUser) return
    fetch(`${API_BASE}/api/exercises?user_id=${currentUser.id}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((all) => setDaysWithWorkouts(new Set(all.map((item) => item.day))))
      .catch(() => {})
  }, [currentUser])

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

  const [settingsClosing, setSettingsClosing] = useState(false)

  function toggleSettings() {
    if (view === 'settings') {
      setSettingsClosing(true)
      setTimeout(() => setSettingsClosing(false), 400)
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
          className={`settings-btn ${view === 'settings' ? 'is-active' : ''} ${settingsClosing ? 'is-closing' : ''}`}
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
            version={APP_VERSION}
            users={users}
            currentUser={currentUser}
            onChangeUser={setCurrentUser}
          />
        ) : (
          <main className="card-list">
            {loading && <p className="status-message">Loading exercises...</p>}
            {error && <p className="status-message">Couldn't load exercises: {error}</p>}
            {!loading && !error && exercises.length === 0 && (
              <div className="empty-day">
                <ZzzIcon className="empty-day-zzz" />
                <p className="empty-day-message">
                  This seems to be a rest day... Feeling a bit enthusiastic, are we?
                </p>
              </div>
            )}
            {!loading &&
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
                  onSave={(updates) => updateExercise(item.id, updates)}
                  onSwap={(reason, otherText) => swapExercise(item.id, reason, otherText)}
                />
              ))}
          </main>
        )}
      </div>

      {view !== 'settings' && (
        <footer className="page-footer">
          <span>{APP_VERSION}</span>
        </footer>
      )}
    </div>
  )
}

export default App
