const db = require('./db')
const { weekdayName, todayISODate } = require('./streak')

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Inserts an uncompleted placeholder row for every exercise currently on
// `day`, for the given date. INSERT OR IGNORE makes this a no-op for any
// exercise that already has a row for that date — never overwrites a real
// completion or an earlier-frozen placeholder.
function rosterDay(userId, day, dateStr) {
  const items = db.prepare(
    'SELECT id, name, sets, reps, weight, duration FROM exercises WHERE user_id = ? AND day = ? AND deleted_at IS NULL',
  ).all(userId, day)
  if (items.length === 0) return

  const insert = db.prepare(`
    INSERT OR IGNORE INTO workout_history
      (user_id, day, real_date, exercise_id, name, sets, reps, weight, duration, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `)
  for (const item of items) {
    insert.run(userId, day, dateStr, item.id, item.name, item.sets, item.reps, item.weight, item.duration)
  }
}

// Backfills every date's roster from wherever this last ran through today —
// same "walk forward, no retroactive history before this ever ran" pattern
// as streak.js's syncScheduledWorkouts, with the same accepted limitation: a
// gap day nobody opened the app for gets caught up using whatever the plan
// looks like *now*, not a true point-in-time snapshot of that date.
function syncRoster(userId) {
  const today = todayISODate()
  const profile = db.prepare('SELECT history_synced_until FROM user_profile WHERE id = ?').get(userId)
  let cursor = profile?.history_synced_until || today

  while (cursor <= today) {
    rosterDay(userId, weekdayName(cursor), cursor)
    if (cursor === today) break
    cursor = addDays(cursor, 1)
  }

  db.prepare('UPDATE user_profile SET history_synced_until = ? WHERE id = ?').run(today, userId)
}

// Marks a today-rostered exercise completed, freshly re-capturing its live
// stats at this exact moment — its placeholder row may have been created
// earlier today (possibly with now-stale values if it was edited since), so
// completion always overwrites rather than trusting the placeholder. Only
// ever touches today's row; a real_date once in the past is never written
// to again by this.
function recordCompletion(userId, exerciseId) {
  const exercise = db.prepare(
    'SELECT id, name, day, sets, reps, weight, duration FROM exercises WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
  ).get(exerciseId, userId)
  if (!exercise) return null

  syncRoster(userId)
  const realDate = todayISODate()

  db.prepare(`
    INSERT INTO workout_history (user_id, day, real_date, exercise_id, name, sets, reps, weight, duration, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, exercise_id, real_date) DO UPDATE SET
      day = excluded.day, name = excluded.name, sets = excluded.sets, reps = excluded.reps,
      weight = excluded.weight, duration = excluded.duration, completed_at = excluded.completed_at
  `).run(userId, exercise.day, realDate, exercise.id, exercise.name, exercise.sets, exercise.reps, exercise.weight, exercise.duration)

  return db.prepare(
    'SELECT * FROM workout_history WHERE user_id = ? AND exercise_id = ? AND real_date = ?',
  ).get(userId, exercise.id, realDate)
}

// Reverses recordCompletion for a same-day uncheck — reverts to an
// uncompleted placeholder rather than deleting the row, so the day's roster
// stays intact. Scoped to today only: a real_date in the past can't be
// reopened this way, by construction (not just convention).
function recordUncompletion(userId, exerciseId) {
  const realDate = todayISODate()
  db.prepare(
    'UPDATE workout_history SET completed_at = NULL WHERE user_id = ? AND exercise_id = ? AND real_date = ?',
  ).run(userId, exerciseId, realDate)
  return db.prepare(
    'SELECT * FROM workout_history WHERE user_id = ? AND exercise_id = ? AND real_date = ?',
  ).get(userId, exerciseId, realDate)
}

// One row per exercise scheduled that real date. `stale` is per-exercise, not
// per-day (a day can mix rich and stale cards) — true whenever the live
// exercise this row points at no longer matches: deleted, or renamed (a swap
// rewrites name in place on the same id, so a name change here means "this
// used to be a different exercise"). Having since moved to a different day
// does NOT count as stale — the row's own `day` is already a fixed
// historical fact ("this was done as part of Monday's plan"), and the
// exercise's live content (description/photo/etc.) is still valid enrichment
// for it regardless of which day it's scheduled under now.
// Uncompleted rows are never enriched with live fields — nothing was done,
// so there's nothing to show beyond what was scheduled.
function getDay(userId, dateStr) {
  const rows = db.prepare(
    'SELECT * FROM workout_history WHERE user_id = ? AND real_date = ? ORDER BY id ASC',
  ).all(userId, dateStr)

  return rows.map((row) => {
    const base = {
      exercise_id: row.exercise_id,
      day: row.day,
      name: row.name,
      sets: row.sets,
      reps: row.reps,
      weight: row.weight,
      duration: row.duration,
      completed: !!row.completed_at,
      completed_at: row.completed_at,
    }

    if (!row.completed_at) return { ...base, stale: false, live: null }

    const liveExercise = row.exercise_id
      ? db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(row.exercise_id, userId)
      : null
    const matches = liveExercise && liveExercise.name === row.name

    return {
      ...base,
      stale: !matches,
      live: matches ? {
        description: liveExercise.description,
        bullets: liveExercise.bullets ? JSON.parse(liveExercise.bullets) : [],
        category: liveExercise.category,
        photo: liveExercise.photo,
        video_id: liveExercise.video_id,
        muscles: liveExercise.muscles ? JSON.parse(liveExercise.muscles) : [],
      } : null,
    }
  })
}

module.exports = { syncRoster, recordCompletion, recordUncompletion, getDay }
