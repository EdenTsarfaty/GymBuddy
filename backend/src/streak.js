const db = require('./db')

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayISODate() {
  return toISODate(new Date())
}

function weekdayName(dateStr) {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00`).getDay()]
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

function getScheduledWeekdays(userId) {
  const rows = db.prepare('SELECT day FROM day_plans WHERE user_id = ?').all(userId)
  return new Set(rows.map((r) => r.day))
}

// Next date strictly after `dateStr` whose weekday is scheduled. Always checked
// against the *current* day_plans — if the plan changes mid-window there's no
// attempt to reconstruct what the schedule looked like before that.
function nextScheduledDateAfter(userId, dateStr) {
  const scheduledDays = getScheduledWeekdays(userId)
  if (scheduledDays.size === 0) return null
  let cursor = dateStr
  for (let i = 0; i < 14; i++) {
    cursor = addDays(cursor, 1)
    if (scheduledDays.has(weekdayName(cursor))) return cursor
  }
  return null
}

// Backfills workout_log rows for every scheduled date up through today, walking
// forward from the latest date already on record (or from today itself, for a
// user with no history yet — this is the "no retroactive history" boundary).
// Rows get created whether or not they end up performed, so a date that's missed
// while nobody opens the app still gets classified correctly later.
function syncScheduledWorkouts(userId, todayStr) {
  const scheduledDays = getScheduledWeekdays(userId)
  if (scheduledDays.size === 0) return

  const last = db.prepare('SELECT MAX(scheduled_date) as d FROM workout_log WHERE user_id = ?').get(userId).d
  let cursor = last ? addDays(last, 1) : todayStr

  const insert = db.prepare('INSERT OR IGNORE INTO workout_log (user_id, scheduled_date) VALUES (?, ?)')
  while (cursor <= todayStr) {
    if (scheduledDays.has(weekdayName(cursor))) insert.run(userId, cursor)
    cursor = addDays(cursor, 1)
  }
}

function recomputeStreak(userId) {
  const today = todayISODate()
  syncScheduledWorkouts(userId, today)

  const rows = db.prepare(
    'SELECT scheduled_date, performed_date FROM workout_log WHERE user_id = ? ORDER BY scheduled_date ASC',
  ).all(userId)

  let streak = 0
  for (const row of rows) {
    if (row.performed_date) {
      streak += 1
      continue
    }
    const nextDate = nextScheduledDateAfter(userId, row.scheduled_date)
    if (nextDate && today >= nextDate) {
      streak = 0
    }
    // else: grace window still open — pending, leave the running count untouched
  }

  const profile = db.prepare('SELECT longest_streak FROM user_profile WHERE id = ?').get(userId)
  const longest = Math.max(profile?.longest_streak ?? 0, streak)

  db.prepare('UPDATE user_profile SET current_streak = ?, longest_streak = ? WHERE id = ?').run(streak, longest, userId)

  return { current_streak: streak, longest_streak: longest }
}

// Returns null if `scheduledDate` has no workout_log row for this user (either it
// isn't a scheduled weekday, or it's a past date from before this ever ran for
// them — no retroactive history, per the no-backfill rule).
function markPerformed(userId, scheduledDate, performedDate) {
  const today = todayISODate()
  syncScheduledWorkouts(userId, today)

  const existing = db.prepare(
    'SELECT id FROM workout_log WHERE user_id = ? AND scheduled_date = ?',
  ).get(userId, scheduledDate)
  if (!existing) return null

  db.prepare('UPDATE workout_log SET performed_date = ? WHERE id = ?').run(performedDate || today, existing.id)

  const streak = recomputeStreak(userId)
  const workoutLog = db.prepare(
    'SELECT id, user_id, scheduled_date, performed_date FROM workout_log WHERE id = ?',
  ).get(existing.id)

  return { workoutLog, ...streak }
}

module.exports = {
  getScheduledWeekdays,
  syncScheduledWorkouts,
  nextScheduledDateAfter,
  recomputeStreak,
  markPerformed,
  weekdayName,
  todayISODate,
}
