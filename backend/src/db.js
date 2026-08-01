const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'gymbuddy.db')

fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    day TEXT NOT NULL,
    sets INTEGER NOT NULL,
    weight INTEGER NOT NULL,
    description TEXT,
    bullets TEXT
  )
`)

const exerciseCount = db.prepare('SELECT COUNT(*) AS count FROM exercises').get().count

if (exerciseCount === 0) {
  const insert = db.prepare(
    'INSERT INTO exercises (name, day, sets, weight, description, bullets) VALUES (?, ?, ?, ?, ?, ?)',
  )

  const seedExercises = [
    {
      name: 'Squat',
      day: 'Monday',
      sets: 3,
      weight: 60,
      description:
        'A compound lower-body lift that builds strength through the quads, glutes, and core.',
      bullets: ['Feet shoulder-width apart', 'Keep chest up', 'Drive through your heels'],
    },
    {
      name: 'Bench Press',
      day: 'Monday',
      sets: 4,
      weight: 40,
      description: 'A pressing movement that targets the chest, shoulders, and triceps.',
      bullets: ['Shoulder blades retracted', 'Bar path over the chest', 'Control the descent'],
    },
    {
      name: 'Deadlift',
      day: 'Wednesday',
      sets: 3,
      weight: 80,
      description: 'A full-body pull that builds posterior chain strength from the ground up.',
      bullets: ['Neutral spine throughout', 'Bar close to your shins', 'Hips and shoulders rise together'],
    },
    {
      name: 'Overhead Press',
      day: 'Wednesday',
      sets: 3,
      weight: 25,
      description: 'A standing press that builds shoulder strength and core stability.',
      bullets: ['Brace your core', 'Press bar in a straight line', 'Avoid arching your lower back'],
    },
    {
      name: 'Lunges',
      day: 'Saturday',
      sets: 4,
      weight: 20,
      description:
        'Lunges are a lower-body unilateral strength move that targets the quadriceps, glutes, and hamstrings while also training balance and core stability.',
      bullets: [
        'Step so both knees bend to about 90 degrees',
        'Keep your torso tall and braced',
        'Push through the whole foot to stand back up',
      ],
    },
  ]

  for (const exercise of seedExercises) {
    insert.run(
      exercise.name,
      exercise.day,
      exercise.sets,
      exercise.weight,
      exercise.description,
      JSON.stringify(exercise.bullets),
    )
  }
}

module.exports = db
