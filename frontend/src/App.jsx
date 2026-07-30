import { useEffect, useState } from 'react'
import WorkoutCard from './components/WorkoutCard'
import './App.css'

const APP_VERSION = '0.0.2'
const THEME_STORAGE_KEY = 'gymbuddy-theme'

const initialExercises = [
  {
    exercise: 'Squat',
    sets: 3,
    weight: 60,
    description:
      'A compound lower-body lift that builds strength through the quads, glutes, and core.',
    bullets: ['Feet shoulder-width apart', 'Keep chest up', 'Drive through your heels'],
  },
  {
    exercise: 'Bench Press',
    sets: 4,
    weight: 40,
    description: 'A pressing movement that targets the chest, shoulders, and triceps.',
    bullets: ['Shoulder blades retracted', 'Bar path over the chest', 'Control the descent'],
  },
  {
    exercise: 'Deadlift',
    sets: 3,
    weight: 80,
    description: 'A full-body pull that builds posterior chain strength from the ground up.',
    bullets: ['Neutral spine throughout', 'Bar close to your shins', 'Hips and shoulders rise together'],
  },
  {
    exercise: 'Overhead Press',
    sets: 3,
    weight: 25,
    description: 'A standing press that builds shoulder strength and core stability.',
    bullets: ['Brace your core', 'Press bar in a straight line', 'Avoid arching your lower back'],
  },
]

const today = new Date().toLocaleDateString(undefined, { weekday: 'long' })

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme)
  const [exercises, setExercises] = useState(initialExercises)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }

  function updateExercise(name, updates) {
    setExercises((current) =>
      current.map((item) => (item.exercise === name ? { ...item, ...updates } : item)),
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>GymBuddy</h1>
        <p className="today">{today}</p>
      </header>

      <main className="card-list">
        {exercises.map((item) => (
          <WorkoutCard
            key={item.exercise}
            exercise={item.exercise}
            sets={item.sets}
            weight={item.weight}
            description={item.description}
            bullets={item.bullets}
            onSave={(updates) => updateExercise(item.exercise, updates)}
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
