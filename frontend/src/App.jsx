import { useEffect, useState } from 'react'
import WorkoutCard from './components/WorkoutCard'
import './App.css'

const APP_VERSION = '0.0.3'
const THEME_STORAGE_KEY = 'gymbuddy-theme'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

const today = new Date().toLocaleDateString(undefined, { weekday: 'long' })

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    fetch(`${API_BASE}/api/exercises`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load exercises')
        return res.json()
      })
      .then(setExercises)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
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
        <h1>GymBuddy</h1>
        <p className="today">{today}</p>
      </header>

      <main className="card-list">
        {loading && <p className="status-message">Loading exercises...</p>}
        {error && <p className="status-message">Couldn't load exercises: {error}</p>}
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
