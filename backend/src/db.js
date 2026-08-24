const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'gymbuddy.db')
const EXERCISE_PHOTOS_DIR = path.join(DATA_DIR, 'exercise-photos')

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(EXERCISE_PHOTOS_DIR, { recursive: true })

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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    name        TEXT NOT NULL,
    day         TEXT NOT NULL,
    sets        INTEGER,
    reps        INTEGER,
    weight      REAL,
    duration    INTEGER,
    description TEXT,
    bullets     TEXT,
    video_id    TEXT,
    category    TEXT
  )
`)
try { db.exec('ALTER TABLE exercises ADD COLUMN reps INTEGER') } catch {}
try { db.exec('ALTER TABLE exercises ADD COLUMN adjustments TEXT') } catch {}
// Either our own generated filename (an uploaded photo, re-encoded and stored
// under EXERCISE_PHOTOS_DIR, served via /api/exercise-photos/:filename) or a
// validated https:// URL rendered directly by the client — never both, never
// fetched server-side. See streakGuardian.js-adjacent design notes in memory
// for why the two cases share one column (their value shapes never collide).
try { db.exec('ALTER TABLE exercises ADD COLUMN photo TEXT') } catch {}
// Explicit position within a (user_id, day) group — lets manual reordering
// (Edit Plan's drag handle) persist independently of insertion/id order,
// which the app previously relied on implicitly. Backfilled once below from
// existing id order so pre-existing rows keep their current on-screen order.
try { db.exec('ALTER TABLE exercises ADD COLUMN sort_order INTEGER') } catch {}
// Soft-delete marker (epoch ms, NULL = active) — deleting an exercise flips
// this instead of removing the row, so Edit Plan's Undo can restore it
// exactly (same id, same chat history, same photo file) rather than
// recreating a lookalike. A background sweep (see exerciseSweep.js)
// hard-deletes rows past a short grace period once nothing can undo them
// any more; every read that lists/looks up exercises must exclude rows
// where this is set.
try { db.exec('ALTER TABLE exercises ADD COLUMN deleted_at INTEGER') } catch {}
// JSON array of muscle-highlighter slugs (see MUSCLE_GROUPS in openai.js) —
// null for exercises created before this existed or entered manually.
try { db.exec('ALTER TABLE exercises ADD COLUMN muscles TEXT') } catch {}
{
  const needsBackfill = db.prepare('SELECT COUNT(*) AS c FROM exercises WHERE sort_order IS NULL').get().c
  if (needsBackfill > 0) {
    const rows = db.prepare('SELECT id, user_id, day FROM exercises WHERE sort_order IS NULL ORDER BY user_id, day, id').all()
    const setSortOrder = db.prepare('UPDATE exercises SET sort_order = ? WHERE id = ?')
    const nextIndex = new Map()
    for (const row of rows) {
      const key = `${row.user_id}|${row.day}`
      const index = (nextIndex.get(key) ?? -1) + 1
      nextIndex.set(key, index)
      setSortOrder.run(index, row.id)
    }
  }
}

// Photo files marked for deferred cleanup instead of deleted on the spot —
// same reasoning as exercises' deleted_at: replacing/clearing a photo used
// to unlink the old file immediately, which made Undo unable to point back
// at it. Now the old file just gets listed here with a timestamp; a
// background sweep (see photoSweep.js) actually removes it once its grace
// period has passed and nothing can undo that far back any more.
db.exec(`
  CREATE TABLE IF NOT EXISTS orphaned_photos (
    filename    TEXT PRIMARY KEY,
    orphaned_at INTEGER NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS user_profile (
    id           INTEGER PRIMARY KEY,
    age          INTEGER,
    height       REAL,
    weight       REAL,
    goals        TEXT,
    beginner_mode INTEGER DEFAULT 0
  )
`)

db.prepare('INSERT OR IGNORE INTO user_profile (id) VALUES (1)').run()
db.prepare('INSERT OR IGNORE INTO user_profile (id) VALUES (2)').run()

db.exec(`
  CREATE TABLE IF NOT EXISTS day_plans (
    user_id INTEGER NOT NULL,
    day     TEXT NOT NULL,
    title   TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    role        TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)
db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_exercise ON chat_messages(exercise_id)')
try { db.exec('ALTER TABLE chat_messages ADD COLUMN proposals TEXT') } catch {}
try { db.exec('ALTER TABLE chat_messages ADD COLUMN token_count INTEGER') } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS workout_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    performed_date TEXT,
    UNIQUE(user_id, scheduled_date)
  )
`)

try { db.exec('ALTER TABLE user_profile ADD COLUMN current_streak INTEGER DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN longest_streak INTEGER DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN workout_reminder INTEGER DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN protein_reminder INTEGER DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN last_workout_reminder_date TEXT') } catch {}
try { db.exec("ALTER TABLE user_profile ADD COLUMN workout_reminder_time TEXT DEFAULT '08:00'") } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN protein_reminder_delay_minutes INTEGER DEFAULT 60') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN protein_reminder_pending_at TEXT') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN streak_freeze_until TEXT') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN streak_guardian_hash TEXT') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN streak_guardian_salt TEXT') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN sex TEXT') } catch {}
try { db.exec('ALTER TABLE user_profile ADD COLUMN medical_notes TEXT') } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    keys     TEXT NOT NULL,
    UNIQUE(user_id, endpoint)
  )
`)

// One row per filled slot in the home header's music-provider grid (6 slots,
// indices 0-5) — an empty slot just has no row. `provider`/`type` are plain
// text rather than enums so a future non-Spotify provider or content type
// doesn't need a migration.
db.exec(`
  CREATE TABLE IF NOT EXISTS music_links (
    user_id       INTEGER NOT NULL,
    slot_index    INTEGER NOT NULL,
    provider      TEXT NOT NULL,
    url           TEXT NOT NULL,
    type          TEXT,
    title         TEXT,
    thumbnail_url TEXT,
    PRIMARY KEY (user_id, slot_index)
  )
`)


const seedUser = (userId, exercises) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM exercises WHERE user_id = ?').get(userId).count
  if (count > 0) return
  const insert = db.prepare(
    'INSERT INTO exercises (user_id, name, day, sets, reps, weight, duration, description, bullets, category, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const nextIndex = new Map()
  for (const ex of exercises) {
    const index = (nextIndex.get(ex.day) ?? -1) + 1
    nextIndex.set(ex.day, index)
    insert.run(userId, ex.name, ex.day, ex.sets ?? null, ex.reps ?? null, ex.weight ?? null, ex.duration ?? null, ex.description, JSON.stringify(ex.bullets), ex.category ?? null, index)
  }
}

seedUser(1, [
  {
    name: 'Treadmill Jog', day: 'Monday', sets: null, reps: null, weight: null, duration: 600, category: 'warm_up',
    description: 'A light cardio warm-up that raises your heart rate and loosens the legs before lifting.',
    bullets: ['Start at a comfortable walking pace', 'Increase to a light jog after 1–2 minutes', 'Keep shoulders relaxed and arms loose'],
  },
  {
    name: 'Squat', day: 'Monday', sets: 3, reps: 10, weight: 60, duration: null, category: 'free_weight',
    description: 'A compound lower-body lift that builds strength through the quads, glutes, and core.',
    bullets: ['Feet shoulder-width apart', 'Keep chest up', 'Drive through your heels'],
  },
  {
    name: 'Bench Press', day: 'Monday', sets: 4, reps: 8, weight: 40, duration: null, category: 'free_weight',
    description: 'A pressing movement that targets the chest, shoulders, and triceps.',
    bullets: ['Shoulder blades retracted', 'Bar path over the chest', 'Control the descent'],
  },
  {
    name: 'Leg Press', day: 'Monday', sets: 3, reps: 12, weight: 80, duration: null, category: 'machine',
    description: 'A machine-based lower body press targeting the quads, glutes, and hamstrings with less spinal load than squats.',
    bullets: ['Feet shoulder-width on the platform', 'Lower until knees reach 90°', 'Push through the full foot, avoid locking knees'],
  },
  {
    name: 'Hip Flexor Stretch', day: 'Monday', sets: null, reps: null, weight: null, duration: 30, category: 'stretch',
    description: 'A static stretch that opens the hip flexors and reduces tightness from sitting or heavy leg days.',
    bullets: ['Kneel on one knee, other foot forward', 'Shift hips forward until you feel a pull in the front hip', 'Hold 20–30 seconds each side'],
  },
])

module.exports = db
