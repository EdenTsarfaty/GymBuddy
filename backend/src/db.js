const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'gymbuddy.db')

fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  )
`)
db.prepare('INSERT OR IGNORE INTO users (id, name) VALUES (1, ?)').run('Eden')
db.prepare('INSERT OR IGNORE INTO users (id, name) VALUES (2, ?)').run('Ilya')

db.exec(`
  CREATE TABLE IF NOT EXISTS exercises (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name    TEXT NOT NULL,
    day     TEXT NOT NULL,
    sets    INTEGER NOT NULL,
    weight  INTEGER NOT NULL,
    description TEXT,
    bullets TEXT
  )
`)

const exerciseCols = db.prepare('PRAGMA table_info(exercises)').all()
if (!exerciseCols.find((c) => c.name === 'user_id')) {
  db.exec('ALTER TABLE exercises ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1')
}

const seedUser = (userId, exercises) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM exercises WHERE user_id = ?').get(userId).count
  if (count > 0) return
  const insert = db.prepare(
    'INSERT INTO exercises (user_id, name, day, sets, weight, description, bullets) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  for (const ex of exercises) {
    insert.run(userId, ex.name, ex.day, ex.sets, ex.weight, ex.description, JSON.stringify(ex.bullets))
  }
}

seedUser(1, [
  {
    name: 'Squat',
    day: 'Monday',
    sets: 3,
    weight: 60,
    description: 'A compound lower-body lift that builds strength through the quads, glutes, and core.',
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
    description: 'A lower-body unilateral move targeting quads, glutes, and hamstrings.',
    bullets: ['Step so both knees bend to 90°', 'Keep torso tall and braced', 'Push through the whole foot to stand'],
  },
])

seedUser(2, [
  {
    name: 'Pull-ups',
    day: 'Tuesday',
    sets: 4,
    weight: 0,
    description: 'A bodyweight back exercise that builds lat width and grip strength.',
    bullets: ['Dead hang to start', 'Pull elbows down toward hips', 'Chin clears the bar'],
  },
  {
    name: 'Dips',
    day: 'Tuesday',
    sets: 3,
    weight: 0,
    description: 'A compound push movement targeting the chest, triceps, and anterior deltoid.',
    bullets: ['Slight forward lean for chest emphasis', 'Lower until shoulders are below elbows', 'Lock out at the top'],
  },
  {
    name: 'Romanian Deadlift',
    day: 'Thursday',
    sets: 4,
    weight: 60,
    description: 'A hip-hinge pattern that isolates the hamstrings and glutes under load.',
    bullets: ['Soft bend in the knees', 'Bar stays close to the legs', 'Hinge until you feel a hamstring stretch'],
  },
  {
    name: 'Barbell Row',
    day: 'Thursday',
    sets: 3,
    weight: 50,
    description: 'A horizontal pull that thickens the upper and mid back.',
    bullets: ['Hinge to roughly 45°', 'Pull bar to the lower ribcage', 'Squeeze shoulder blades at the top'],
  },
])

db.exec(`
  CREATE TABLE IF NOT EXISTS user_profile (
    id      INTEGER PRIMARY KEY,
    age     INTEGER,
    height  REAL,
    weight  REAL
  )
`)

db.prepare('INSERT OR IGNORE INTO user_profile (id) VALUES (1)').run()
db.prepare('INSERT OR IGNORE INTO user_profile (id) VALUES (2)').run()

module.exports = db
