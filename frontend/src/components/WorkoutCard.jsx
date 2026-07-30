function WorkoutCard({ exercise, sets, weight }) {
  return (
    <div className="workout-card">
      <h3 className="workout-card-title">{exercise}</h3>

      <div className="workout-card-right">
        <div className="stat">
          <span className="stat-label">Sets</span>
          <span className="stat-value">{sets}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Weight</span>
          <span className="stat-value">{weight} kg</span>
        </div>
        <button type="button" className="expand-btn" aria-label="Expand (coming soon)">
          ⌄
        </button>
      </div>
    </div>
  )
}

export default WorkoutCard
