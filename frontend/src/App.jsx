import { Fragment, useEffect, useRef, useState } from 'react'
import WorkoutCard from './components/WorkoutCard'
import Logo from './components/Logo'
import CalendarIcon from './components/icons/CalendarIcon'
import ChevronLeftIcon from './components/icons/ChevronLeftIcon'
import TableIcon from './components/icons/TableIcon'
import ZzzIcon from './components/icons/ZzzIcon'
import './App.css'

const APP_VERSION = '0.0.4.1'
const THEME_STORAGE_KEY = 'gymbuddy-theme'
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

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme)
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
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`${API_BASE}/api/exercises?day=${encodeURIComponent(selectedDay)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load exercises')
        return res.json()
      })
      .then(setExercises)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [selectedDay])

  useEffect(() => {
    fetch(`${API_BASE}/api/exercises`)
      .then((res) => (res.ok ? res.json() : []))
      .then((all) => setDaysWithWorkouts(new Set(all.map((item) => item.day))))
      .catch(() => {})
  }, [])

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

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
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

  return (
    <div className="page">
      <header className="page-header">
        <Logo height={64} className="page-logo" />
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
                    className={`plan-menu-option ${day === today ? 'is-today' : ''} ${day === selectedDay ? 'is-selected' : ''} ${day !== today && !daysWithWorkouts.has(day) ? 'is-empty-day' : ''}`}
                    onClick={() => selectDay(day)}
                  >
                    {day}
                  </button>
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </header>

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
              onSave={(updates) => updateExercise(item.id, updates)}
            />
          ))}
      </main>

      <footer className="page-footer">
        <span>v{APP_VERSION}</span>
        <button type="button" className="theme-toggle" onClick={toggleTheme}>
          {theme === 'light' ? 'Light' : 'Dark'}
        </button>
      </footer>
    </div>
  )
}

export default App
