import { useEffect, useState } from 'react'
import WorkoutCard from './components/WorkoutCard'
import './App.css'

const APP_VERSION = '0.0.2'
const THEME_STORAGE_KEY = 'gymbuddy-theme'

const placeholderExercises = [
  { exercise: 'Squat', sets: 3, weight: 60 },
  { exercise: 'Bench Press', sets: 4, weight: 40 },
  { exercise: 'Deadlift', sets: 3, weight: 80 },
  { exercise: 'Overhead Press', sets: 3, weight: 25 },
]

const today = new Date().toLocaleDateString(undefined, { weekday: 'long' })

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>GymBuddy</h1>
        <p className="today">{today}</p>
      </header>

      <main className="card-list">
        {placeholderExercises.map((item) => (
          <WorkoutCard
            key={item.exercise}
            exercise={item.exercise}
            sets={item.sets}
            weight={item.weight}
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
