import WorkoutCard from './components/WorkoutCard'
import './App.css'

const APP_VERSION = '0.0.1'

const placeholderExercises = [
  { exercise: 'Squat', sets: 3, weight: 60 },
  { exercise: 'Bench Press', sets: 4, weight: 40 },
  { exercise: 'Deadlift', sets: 3, weight: 80 },
  { exercise: 'Overhead Press', sets: 3, weight: 25 },
]

const today = new Date().toLocaleDateString(undefined, { weekday: 'long' })

function App() {
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

      <footer className="page-footer">v{APP_VERSION}</footer>
    </div>
  )
}

export default App
