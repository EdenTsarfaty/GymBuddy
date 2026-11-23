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

// A weekday counts as "scheduled" purely by having exercises on it — NOT by
// having a day_plans row. day_plans only ever holds a day's display title
// (see server.js's day-plans endpoints); a day can have exercises but no
// title (shown as "Undefined" in Edit Plan) or a title but no exercises
// (an empty labeled day), and neither should affect whether it's scheduled.
// Matches how the frontend already derives its own daysWithWorkouts
// (App.jsx) straight from the exercises list.
function getScheduledWeekdays(userId) {
  const rows = db.prepare('SELECT DISTINCT day FROM exercises WHERE user_id = ? AND deleted_at IS NULL').all(userId)
  const scheduled = new Set(rows.map((r) => r.day))
  // A cardio day is "the workout" on its own — go swim, go jog — independent
  // of whether any stretches have been added under it, so it counts as
  // scheduled even with zero exercise rows (unlike a normal day, which is
  // only ever scheduled by virtue of having exercises).
  const cardioRows = db.prepare('SELECT day FROM day_plans WHERE user_id = ? AND cardio_type IS NOT NULL').all(userId)
  for (const { day } of cardioRows) scheduled.add(day)
  return scheduled
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

  // Snapshotted onto the row at creation time (see the `cardio_type` column
  // comment in db.js) — read once per sync rather than per date, since
  // day_plans can't change mid-loop.
  const cardioByDay = new Map(
    db.prepare('SELECT day, cardio_type FROM day_plans WHERE user_id = ? AND cardio_type IS NOT NULL').all(userId)
      .map((r) => [r.day, r.cardio_type]),
  )

  const insert = db.prepare('INSERT OR IGNORE INTO workout_log (user_id, scheduled_date, cardio_type) VALUES (?, ?, ?)')
  while (cursor <= todayStr) {
    const day = weekdayName(cursor)
    if (scheduledDays.has(day)) insert.run(userId, cursor, cardioByDay.get(day) || null)
    cursor = addDays(cursor, 1)
  }
}

// All workout_log rows for this user, synced through today so scheduled dates
// with no completion still show up (as missed/pending, not just absent).
function getHistory(userId) {
  syncScheduledWorkouts(userId, todayISODate())
  return db.prepare(
    'SELECT scheduled_date, performed_date, cardio_type, cardio_done, workout_started_at, workout_ended_at, workout_utc_offset_min, workout_duration_sec FROM workout_log WHERE user_id = ? ORDER BY scheduled_date ASC',
  ).all(userId)
}

const MAX_SESSION_SEC = 24 * 60 * 60

// Checks a session payload ({ started_at, ended_at, utc_offset_min,
// duration_sec }) and returns the cleaned values, or null if it isn't valid.
// Every field is optional on its own (a session logged with only a duration,
// say) but whatever is present has to make sense.
function parseSession(session) {
  if (!session || typeof session !== 'object') return null
  const isoMs = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : NaN)
  const out = { started_at: null, ended_at: null, utc_offset_min: null, duration_sec: null }
  if (session.started_at != null) {
    if (Number.isNaN(isoMs(session.started_at))) return null
    out.started_at = new Date(isoMs(session.started_at)).toISOString()
  }
  if (session.ended_at != null) {
    if (Number.isNaN(isoMs(session.ended_at))) return null
    out.ended_at = new Date(isoMs(session.ended_at)).toISOString()
  }
  if (out.started_at && out.ended_at && out.ended_at < out.started_at) return null
  if (session.utc_offset_min != null) {
    if (!Number.isInteger(session.utc_offset_min) || Math.abs(session.utc_offset_min) > 14 * 60) return null
    out.utc_offset_min = session.utc_offset_min
  }
  if (session.duration_sec != null) {
    if (!Number.isInteger(session.duration_sec) || session.duration_sec < 1 || session.duration_sec > MAX_SESSION_SEC) return null
    out.duration_sec = session.duration_sec
  }
  return out
}

// Records whether a cardio day's own entry is checked off, separately from
// the day-level performed_date (see the cardio_done column comment in
// db.js), plus the session behind it. `session` follows "latest state wins":
//   undefined -> leave whatever session is stored untouched
//   null      -> clear the session (done, but with no details)
//   object    -> replace it (validated by parseSession; an invalid one makes
//                this return { invalid: true } without changing anything)
// Un-doing the entry always clears the session with it. Returns null when
// there's no row for that date, same as markPerformed.
function setCardioDone(userId, scheduledDate, done, session) {
  syncScheduledWorkouts(userId, todayISODate())
  const existing = db.prepare(
    'SELECT id FROM workout_log WHERE user_id = ? AND scheduled_date = ?',
  ).get(userId, scheduledDate)
  if (!existing) return null

  let clean = null
  if (done && session) {
    clean = parseSession(session)
    if (!clean) return { invalid: true }
  }

  if (!done || session === null || clean) {
    const s = clean || { started_at: null, ended_at: null, utc_offset_min: null, duration_sec: null }
    db.prepare(
      `UPDATE workout_log SET cardio_done = ?, workout_started_at = ?, workout_ended_at = ?,
         workout_utc_offset_min = ?, workout_duration_sec = ? WHERE id = ?`,
    ).run(done ? 1 : 0, s.started_at, s.ended_at, s.utc_offset_min, s.duration_sec, existing.id)
  } else {
    db.prepare('UPDATE workout_log SET cardio_done = 1 WHERE id = ?').run(existing.id)
  }

  return db.prepare(
    `SELECT scheduled_date, cardio_done, workout_started_at, workout_ended_at,
            workout_utc_offset_min, workout_duration_sec FROM workout_log WHERE id = ?`,
  ).get(existing.id)
}

function recomputeStreak(userId) {
  const today = todayISODate()
  syncScheduledWorkouts(userId, today)

  const rows = db.prepare(
    'SELECT id, scheduled_date, performed_date, frozen FROM workout_log WHERE user_id = ? ORDER BY scheduled_date ASC',
  ).all(userId)

  const profile = db.prepare('SELECT longest_streak, streak_freeze_until, streak_freeze_from FROM user_profile WHERE id = ?').get(userId)
  let freezeUntil = profile?.streak_freeze_until || null
  let freezeFrom = profile?.streak_freeze_from || null
  const markFrozen = db.prepare('UPDATE workout_log SET frozen = 1 WHERE id = ?')

  let streak = 0
  const protectedDates = []
  for (const row of rows) {
    if (row.performed_date) {
      streak += 1
      continue
    }
    const withinLiveFreeze = freezeUntil && freezeFrom && row.scheduled_date >= freezeFrom && row.scheduled_date <= freezeUntil
    // A missed date covered by an active streak freeze neither breaks the
    // streak nor extends it — the count just holds until the freeze lifts.
    // `frozen`, once set on this row, stays set regardless of what
    // user_profile's freeze fields become later (they get overwritten on
    // every reactivation, so reading them live here would silently
    // un-protect a date that was genuinely frozen under an earlier window)
    // — same durability pattern performed_date already has.
    if (row.frozen || withinLiveFreeze) {
      if (withinLiveFreeze && !row.frozen) markFrozen.run(row.id)
      protectedDates.push(row.scheduled_date)
      continue
    }
    const nextDate = nextScheduledDateAfter(userId, row.scheduled_date)
    if (nextDate && today >= nextDate) {
      streak = 0
    }
    // else: grace window still open — pending, leave the running count untouched
  }

  const longest = Math.max(profile?.longest_streak ?? 0, streak)

  // Auto-deactivate an expired freeze — nothing else clears these once
  // `until` passes, so without this Settings would keep showing "Deactivate"
  // and the freeze notice would keep blocking the home screen indefinitely.
  // Every date the freeze actually covered is already durably protected via
  // workout_log.frozen above, so clearing these here loses nothing.
  if (freezeUntil && today > freezeUntil) {
    db.prepare('UPDATE user_profile SET streak_freeze_until = NULL, streak_freeze_from = NULL WHERE id = ?').run(userId)
    freezeUntil = null
    freezeFrom = null
  }

  db.prepare('UPDATE user_profile SET current_streak = ?, longest_streak = ? WHERE id = ?').run(streak, longest, userId)

  return {
    current_streak: streak,
    longest_streak: longest,
    streak_freeze_until: freezeUntil,
    streak_freeze_from: freezeFrom,
    protected_dates: protectedDates,
  }
}

// Returns null if `scheduledDate` has no workout_log row for this user (either it
// isn't a scheduled weekday, or it's a past date from before this ever ran for
// them — no retroactive history, per the no-backfill rule).
function markPerformed(userId, scheduledDate, performedDate) {
  const today = todayISODate()
  syncScheduledWorkouts(userId, today)

  const existing = db.prepare(
    'SELECT id, performed_date FROM workout_log WHERE user_id = ? AND scheduled_date = ?',
  ).get(userId, scheduledDate)
  if (!existing) return null

  // The app re-sends this on every load of a day that's already finished
  // (its "everything's checked" condition is true again once completions are
  // read back). Nothing about the day has changed, so leave it exactly as
  // recorded — no new performed_date, no cardio re-snapshot — and tell the
  // caller so it can skip the celebration and the protein reminder.
  if (existing.performed_date) {
    const row = db.prepare(
      'SELECT id, user_id, scheduled_date, performed_date FROM workout_log WHERE id = ?',
    ).get(existing.id)
    return { workoutLog: row, ...recomputeStreak(userId), alreadyPerformed: true }
  }

  // Re-snapshot the cardio type at completion, not just at row creation
  // (syncScheduledWorkouts) — the row can predate someone marking the day
  // as cardio, and the Month view colors off this column.
  const planned = db.prepare(
    'SELECT cardio_type FROM day_plans WHERE user_id = ? AND day = ?',
  ).get(userId, weekdayName(scheduledDate))
  db.prepare('UPDATE workout_log SET performed_date = ?, cardio_type = ? WHERE id = ?')
    .run(performedDate || today, planned?.cardio_type || null, existing.id)

  const streak = recomputeStreak(userId)
  const workoutLog = db.prepare(
    'SELECT id, user_id, scheduled_date, performed_date FROM workout_log WHERE id = ?',
  ).get(existing.id)

  return { workoutLog, ...streak }
}

// Reverses markPerformed for an accidental "Complete Workout" press — clears
// performed_date and recomputes the streak as if it never happened. Returns
// null under the same conditions markPerformed would.
function markUnperformed(userId, scheduledDate) {
  const existing = db.prepare(
    'SELECT id FROM workout_log WHERE user_id = ? AND scheduled_date = ?',
  ).get(userId, scheduledDate)
  if (!existing) return null

  db.prepare('UPDATE workout_log SET performed_date = NULL WHERE id = ?').run(existing.id)

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
  markUnperformed,
  setCardioDone,
  getHistory,
  weekdayName,
  todayISODate,
}
