import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import LottiePlayer from './LottiePlayer'

const THINKING_SENTENCES = [
  'Thinking about your preferences...',
  'Considering your goals...',
  'Figuring out your weekly split...',
  'Planning your rest days...',
  'Building a plan for you...',
  'Choosing the right exercises...',
  'Almost there...',
]

function RotatingSentence() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((i) => (i + 1) % THINKING_SENTENCES.length)
        setVisible(true)
      }, 350)
    }, 2800)
    return () => clearInterval(id)
  }, [])

  return (
    <p className={`regen-sentence ${visible ? 'is-visible' : ''}`}>
      {THINKING_SENTENCES[index]}
    </p>
  )
}

function PlanGeneratingOverlay({ phase, planStructure }) {
  return createPortal(
    <div className="regen-generating-overlay">
      <div className="regen-generating">
        <LottiePlayer size={210} />

        {phase === 'thinking' ? (
          <RotatingSentence />
        ) : (
          <div className="regen-day-cards">
            {planStructure.map((dayPlan) => (
              <div
                key={dayPlan.day}
                className={`regen-day-card ${dayPlan.done ? 'is-done' : 'is-active'}`}
              >
                <span className="regen-day-card-title">
                  {dayPlan.day} — {dayPlan.title}
                </span>
                <span className="regen-day-card-status">
                  {dayPlan.done
                    ? '✓'
                    : dayPlan.completed === 0
                    ? '···'
                    : `Exercise ${dayPlan.completed} / ${dayPlan.exercises.length}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default PlanGeneratingOverlay
