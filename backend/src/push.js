const webpush = require('web-push')
const db = require('./db')
const streak = require('./streak')
const { logInfo, logError } = require('./logger')

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT

const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT)
if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} else {
  logInfo('Push: VAPID keys not configured — push notifications disabled')
}

function saveSubscription(userId, subscription) {
  const { endpoint, keys } = subscription
  db.prepare(
    'INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, keys) VALUES (?, ?, ?)',
  ).run(userId, endpoint, JSON.stringify(keys))
}

function removeSubscription(userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint)
}

async function sendToUser(userId, payload) {
  if (!pushEnabled) return
  const rows = db.prepare('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = ?').all(userId)
  await Promise.all(rows.map(async (row) => {
    const subscription = { endpoint: row.endpoint, keys: JSON.parse(row.keys) }
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload))
    } catch (err) {
      // 404/410 mean the browser dropped this subscription — stop targeting it.
      if (err.statusCode === 404 || err.statusCode === 410) {
        removeSubscription(userId, row.endpoint)
      } else {
        logError('push.sendToUser', err)
      }
    }
  }))
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

const WORKOUT_REMINDER_MESSAGES = [
  "Today's a workout day — make it count!",
  "Small steps, big gains — today's workout is on the schedule.",
  'You showed up before — show up again today!',
  "Consistency builds champions. Today's your day!",
  "Every workout adds up. Today's one worth showing up for.",
  "Don't forget today's workout — future you will say thanks.",
  "Your workout's on the calendar. Let's make it happen!",
]

const PROTEIN_REMINDER_MESSAGES = [
  'Muscles repair with protein — refuel and lock in those gains!',
  'That workout deserves a protein reward — go refuel!',
  'Recovery starts now. Grab some protein!',
  "Don't let today's effort go to waste — protein time!",
  'Your muscles are calling for protein after that workout.',
  'Great workout! Now give your body the protein it needs to recover.',
  'Give your muscles the protein boost they earned.',
]

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

// Runs every minute. Sends each user's workout-day reminder at most once per
// day, at or after their configured time-of-day — gated by
// last_workout_reminder_date (not an exact-minute match) so a brief server
// restart around the target time doesn't cause a missed day.
function checkWorkoutReminders() {
  if (!pushEnabled) return
  const now = new Date()
  const nowHHMM = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`

  const today = streak.todayISODate()
  const todayWeekday = streak.weekdayName(today)

  const users = db.prepare(
    "SELECT id, workout_reminder_time FROM user_profile WHERE workout_reminder = 1 AND (last_workout_reminder_date IS NULL OR last_workout_reminder_date != ?)",
  ).all(today)

  for (const user of users) {
    const targetTime = user.workout_reminder_time || '08:00'
    if (nowHHMM < targetTime) continue

    const scheduledDays = streak.getScheduledWeekdays(user.id)
    if (!scheduledDays.has(todayWeekday)) continue

    db.prepare('UPDATE user_profile SET last_workout_reminder_date = ? WHERE id = ?').run(today, user.id)
    sendToUser(user.id, {
      title: 'Workout day',
      body: randomFrom(WORKOUT_REMINDER_MESSAGES),
    }).catch((err) => logError('push.checkWorkoutReminders', err))
  }
}

// Called right when a workout is marked performed "now" (not a backfill).
// Schedules a one-off protein reminder `delayMinutes` from now, picked up by
// checkProteinReminders below.
function scheduleProteinReminder(userId, delayMinutes) {
  const sendAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
  db.prepare('UPDATE user_profile SET protein_reminder_pending_at = ? WHERE id = ?').run(sendAt, userId)
}

// Runs every minute. Sends and clears any protein reminder whose scheduled
// time has passed — a plain "is it due yet" poll rather than a real timer, so
// it survives server restarts between scheduling and send time.
function checkProteinReminders() {
  if (!pushEnabled) return
  const nowISO = new Date().toISOString()

  const users = db.prepare(
    'SELECT id FROM user_profile WHERE protein_reminder_pending_at IS NOT NULL AND protein_reminder_pending_at <= ?',
  ).all(nowISO)

  for (const user of users) {
    db.prepare('UPDATE user_profile SET protein_reminder_pending_at = NULL WHERE id = ?').run(user.id)
    sendToUser(user.id, {
      title: 'Drink protein',
      body: randomFrom(PROTEIN_REMINDER_MESSAGES),
    }).catch((err) => logError('push.checkProteinReminders', err))
  }
}

function startScheduler() {
  checkWorkoutReminders()
  checkProteinReminders()
  setInterval(() => {
    checkWorkoutReminders()
    checkProteinReminders()
  }, 60 * 1000)
}

module.exports = {
  saveSubscription,
  removeSubscription,
  sendToUser,
  scheduleProteinReminder,
  startScheduler,
  pushEnabled,
  VAPID_PUBLIC_KEY,
}
