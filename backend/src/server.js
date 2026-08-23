const fs = require('node:fs')
const path = require('node:path')
const fastify = require('fastify')({ logger: false })
const db = require('./db')
const { generateExerciseData, generateSwapExercise, generatePlanStructure, generateDayExercises, generateChatReply, findVideoForExercise, searchYouTube, checkOpenAIHealth, describeOpenAIError, identifyExerciseFromPhoto } = require('./openai')
const { writeLLMLog, logRequest, logError, logInfo, logWarn, logCli, logCliBlock, logStartup, cli } = require('./logger')
const { maybeBackupDatabase } = require('./backup')
const { maybeSyncExerciseNames } = require('./wgerSync')
const { sweepDeletedExercises } = require('./exerciseSweep')
const photoSweep = require('./photoSweep')
const { countTokens } = require('./tokenizer')
const streak = require('./streak')
const streakGuardian = require('./streakGuardian')
const exercisePhotos = require('./exercisePhotos')
const push = require('./push')
const { isTailscaleConnected } = require('./tailscale')

// Bundled at build time from wger.de's public exercise database (English
// names only, deduped — see conversation history for how this was pulled:
// paginated through /api/v2/exercise-translation/, filtered by language id
// 2 since wger's own `language=` query param on that endpoint doesn't
// actually filter server-side). Static file, no live API dependency at
// request time — used to ground/autocomplete Edit Plan's "Title search"
// add-exercise mode against real, community-vetted exercise names rather
// than trusting free-text alone.
const EXERCISE_NAMES_PATH = path.join(__dirname, 'data', 'exerciseNames.json')
let EXERCISE_NAMES = JSON.parse(fs.readFileSync(EXERCISE_NAMES_PATH, 'utf-8'))

// Both of these internally no-op unless enough time has passed since their
// last real run (3 days for backups, 7 for the wger sync), so a daily timer
// is just the trigger cadence — it's cheap to call more often than that. A
// recurring timer (rather than a one-shot startup call) is needed because
// this server process can stay up for weeks without restarting, and a
// startup-only check would only ever get one chance to fire.
maybeBackupDatabase()
setInterval(maybeBackupDatabase, 24 * 60 * 60 * 1000)

// Re-checks wger's exercise names and refreshes the bundled dataset above if
// anything changed (see wgerSync.js).
function runExerciseNameSync() {
  maybeSyncExerciseNames().then((changed) => {
    if (changed) EXERCISE_NAMES = JSON.parse(fs.readFileSync(EXERCISE_NAMES_PATH, 'utf-8'))
  })
}
runExerciseNameSync()
setInterval(runExerciseNameSync, 24 * 60 * 60 * 1000)

// Permanently clears out soft-deleted exercises past their grace period (see
// exerciseSweep.js) — same daily-tick pattern as the two jobs above.
sweepDeletedExercises()
setInterval(sweepDeletedExercises, 24 * 60 * 60 * 1000)

// Same for orphaned photo files (see photoSweep.js).
photoSweep.sweepOrphanedPhotos()
setInterval(photoSweep.sweepOrphanedPhotos, 24 * 60 * 60 * 1000)

checkOpenAIHealth().then((result) => {
  if (result.ok) {
    logInfo('OpenAI: API key valid, credits balance positive')
  } else {
    logInfo(`OpenAI: ${result.message}`)
  }
})

const CLI_COMMANDS = [
  'add user <name>',
  'remove user <name>',
  'rename user <old> <new>',
  'restart',
  'exit',
  'help',
]

let pendingConfirm = null

cli.on('line', (line) => {
  const trimmed = line.trim()

  if (pendingConfirm) {
    const answer = trimmed.toLowerCase()
    const onConfirm = pendingConfirm
    pendingConfirm = null
    if (answer === 'y' || answer === 'yes') {
      onConfirm()
    } else {
      logCli('Cancelled.')
    }
    return
  }

  if (!trimmed) return

  if (/^help$/i.test(trimmed)) {
    logCliBlock('Available commands:', CLI_COMMANDS)
    return
  }

  if (/^restart$/i.test(trimmed)) {
    logCli('Restarting server...')
    fastify.close(() => process.exit(0))
    return
  }

  if (/^exit$/i.test(trimmed)) {
    logCli('Shutting down...')
    fastify.close(() => process.exit(0))
    return
  }

  const addMatch = trimmed.match(/^add user (.+)$/i)
  if (addMatch) {
    const name = addMatch[1].trim()
    if (!name) {
      logCli('Usage: add user <name>')
      return
    }
    const result = db.prepare('INSERT INTO users (name) VALUES (?)').run(name)
    db.prepare('INSERT OR IGNORE INTO user_profile (id) VALUES (?)').run(result.lastInsertRowid)
    logCli(`Added user "${name}" (id ${result.lastInsertRowid})`)
    return
  }

  const removeMatch = trimmed.match(/^remove user (.+)$/i)
  if (removeMatch) {
    const name = removeMatch[1].trim()
    const user = db.prepare('SELECT id, name FROM users WHERE name = ? COLLATE NOCASE').get(name)
    if (!user) {
      logCli(`No user named "${name}"`)
      return
    }
    logCli(`Remove user "${user.name}" (id ${user.id}) and all their data? (y/n)`)
    pendingConfirm = () => {
      db.prepare('DELETE FROM exercises WHERE user_id = ?').run(user.id)
      db.prepare('DELETE FROM day_plans WHERE user_id = ?').run(user.id)
      db.prepare('DELETE FROM user_profile WHERE id = ?').run(user.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
      logCli(`Removed user "${user.name}" (id ${user.id}) and all their data`)
    }
    return
  }

  const renameMatch = trimmed.match(/^rename user (\S+) (\S+)$/i)
  if (renameMatch) {
    const [, oldName, newName] = renameMatch
    const user = db.prepare('SELECT id, name FROM users WHERE name = ? COLLATE NOCASE').get(oldName)
    if (!user) {
      logCli(`No user named "${oldName}"`)
      return
    }
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(newName, user.id)
    logCli(`Renamed user "${user.name}" to "${newName}" (id ${user.id})`)
    return
  }

  logCli(`Unknown command: "${trimmed}". Type "help" for a list of commands.`)
})

fastify.addHook('onResponse', (request, reply, done) => {
  const isNoise = (request.method === 'GET' || request.method === 'OPTIONS') && reply.statusCode < 400
  if (!isNoise) {
    logRequest({
      method: request.method,
      url: request.raw.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    })
  }
  done()
})

const PORT = process.env.PORT || 3001
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://100.106.241.16:5173',
  'http://100.106.241.16:4173',
  'https://asus-laptop.tailed3faf.ts.net',
  'https://asus-laptop.tailed3faf.ts.net:5173',
  'https://gymbuddy.eden-tsarfaty.workers.dev',
]

fastify.register(require('@fastify/cors'), {
  origin: FRONTEND_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
})

fastify.register(require('@fastify/multipart'), {
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
})

fastify.get('/api/health', async () => {
  return { status: 'ok' }
})

const VALID_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function currentDayName() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' })
}

function parseExerciseRow(row) {
  return {
    ...row,
    bullets: JSON.parse(row.bullets),
    adjustments: row.adjustments ? JSON.parse(row.adjustments) : [],
  }
}

fastify.get('/api/users', async () => {
  return db.prepare('SELECT id, name FROM users ORDER BY id').all()
})

fastify.get('/api/exercises', async (request, reply) => {
  const { day, user_id } = request.query
  const uid = user_id ? Number(user_id) : 1

  if (day && !VALID_DAYS.includes(day)) {
    reply.code(400)
    return { error: 'Invalid day' }
  }

  const rows = day
    ? db.prepare('SELECT * FROM exercises WHERE day = ? AND user_id = ? AND deleted_at IS NULL ORDER BY sort_order, id').all(day, uid)
    : db.prepare('SELECT * FROM exercises WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order, id').all(uid)

  return rows.map(parseExerciseRow)
})

fastify.post('/api/exercises/generate', async (request, reply) => {
  const { title, day, user_id } = request.body || {}
  const uid = user_id ? Number(user_id) : 1

  if (!title || !title.trim()) {
    reply.code(400)
    return { error: 'title is required' }
  }

  if (day && !VALID_DAYS.includes(day)) {
    reply.code(400)
    return { error: 'Invalid day' }
  }

  const profileRow = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(uid)
  const profile = profileRow
    ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [], beginner_mode: !!profileRow.beginner_mode }
    : null

  const effectiveDay = day || currentDayName()
  const dayPlan = db.prepare('SELECT title FROM day_plans WHERE user_id = ? AND day = ?').get(uid, effectiveDay)
  const dayTitle = dayPlan?.title || null

  let generated
  try {
    generated = await generateExerciseData(title.trim(), profile, dayTitle)
  } catch (err) {
    logError('POST /api/exercises/generate', new Error(describeOpenAIError(err)))
    reply.code(502)
    return { error: 'Failed to generate exercise data' }
  }

  const maxOrderRow = db.prepare('SELECT MAX(sort_order) AS m FROM exercises WHERE user_id = ? AND day = ?').get(uid, effectiveDay)
  const nextOrder = (maxOrderRow?.m ?? -1) + 1

  const insert = db.prepare(
    'INSERT INTO exercises (user_id, name, day, sets, reps, weight, duration, description, bullets, video_id, category, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const result = insert.run(
    uid,
    title.trim(),
    effectiveDay,
    generated.sets ?? null,
    generated.reps ?? null,
    generated.weight ?? null,
    generated.duration ?? null,
    generated.description,
    JSON.stringify(generated.bullets),
    generated.video_id || null,
    generated.category || null,
    nextOrder,
  )

  const created = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid)
  reply.code(201)
  return parseExerciseRow(created)
})

// Names-only, same role as POST /api/plan/structure but for a single day —
// the day/title stays fixed (this doesn't touch the rest of the week), so
// no DB writes happen here at all. The frontend drives the actual wipe +
// per-exercise creation itself afterward (same as full-plan generation
// does), reusing the existing deletes/plan and /api/exercises/generate
// endpoints, so it can show the same day-progress overlay either way.
fastify.post('/api/plan/day/exercises', async (request, reply) => {
  const { user_id, day, include_current, comments } = request.body || {}
  const uid = user_id ? Number(user_id) : 1

  if (!VALID_DAYS.includes(day)) {
    reply.code(400)
    return { error: 'Invalid day' }
  }

  const profileRow = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(uid)
  const profile = profileRow
    ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [], beginner_mode: !!profileRow.beginner_mode }
    : null

  const dayPlan = db.prepare('SELECT title FROM day_plans WHERE user_id = ? AND day = ?').get(uid, day)
  const dayTitle = dayPlan?.title || day

  let currentNames
  if (include_current) {
    currentNames = db.prepare('SELECT name FROM exercises WHERE user_id = ? AND day = ? AND deleted_at IS NULL ORDER BY sort_order, id').all(uid, day).map((r) => r.name)
  }

  try {
    const names = await generateDayExercises(profile, dayTitle, { currentExercises: currentNames, comments })
    return { names }
  } catch (err) {
    logError('POST /api/plan/day/exercises', new Error(describeOpenAIError(err)))
    reply.code(502)
    return { error: 'Failed to generate day' }
  }
})

// Same generation as POST /api/exercises/generate (same generateExerciseData
// call, same profile/day-title personalization), but returns the generated
// fields as plain JSON instead of inserting a row. Edit Plan's add-exercise
// flows (Title search confirm, Photo search confirm) work against a local
// draft that only gets written to the DB on Save — an immediate insert here
// would create a real exercise even if the user then cancels out of Edit
// Plan without saving.
fastify.post('/api/exercises/generate-preview', async (request, reply) => {
  const { title, day, user_id } = request.body || {}
  const uid = user_id ? Number(user_id) : 1

  if (!title || !title.trim()) {
    reply.code(400)
    return { error: 'title is required' }
  }

  if (day && !VALID_DAYS.includes(day)) {
    reply.code(400)
    return { error: 'Invalid day' }
  }

  const profileRow = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(uid)
  const profile = profileRow
    ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [], beginner_mode: !!profileRow.beginner_mode }
    : null

  const effectiveDay = day || currentDayName()
  const dayPlan = db.prepare('SELECT title FROM day_plans WHERE user_id = ? AND day = ?').get(uid, effectiveDay)
  const dayTitle = dayPlan?.title || null

  try {
    const generated = await generateExerciseData(title.trim(), profile, dayTitle)
    return { name: title.trim(), ...generated }
  } catch (err) {
    logError('POST /api/exercises/generate-preview', new Error(describeOpenAIError(err)))
    reply.code(502)
    return { error: 'Failed to generate exercise data' }
  }
})

// Vision-based "guess this exercise from a photo" for Edit Plan's Photo
// search add-exercise mode. Re-encodes the upload the same way
// saveUploadedPhoto does (decode-then-reencode is the actual security
// boundary, not a mime check) but never writes it to disk — this is a
// one-shot identification, not the exercise's saved photo (that's set
// separately, later, through the existing photo picker). The guessed name is
// never trusted on its own — the frontend requires the user to confirm (or
// edit) it before it's used for anything.
fastify.post('/api/exercises/identify-photo', async (request, reply) => {
  const file = await request.file()
  if (!file) {
    reply.code(400)
    return { error: 'No photo uploaded' }
  }
  const buffer = await file.toBuffer()

  const jpeg = await exercisePhotos.reencodeForAnalysis(buffer)
  if (!jpeg) {
    reply.code(400)
    return { error: "That file isn't a valid image" }
  }

  try {
    const name = await identifyExerciseFromPhoto(`data:image/jpeg;base64,${jpeg.toString('base64')}`)
    return { name }
  } catch (err) {
    logError('POST /api/exercises/identify-photo', new Error(describeOpenAIError(err)))
    reply.code(502)
    return { error: 'Failed to identify exercise from photo' }
  }
})

fastify.get('/api/day-plans', async (request) => {
  const uid = request.query.user_id ? Number(request.query.user_id) : 1
  return db.prepare('SELECT day, title FROM day_plans WHERE user_id = ?').all(uid)
})

// Renames a single day's title from Edit Plan's header — upserts since a
// rest day (no workout scheduled) has no day_plans row yet to UPDATE.
fastify.put('/api/day-plans/:day', async (request, reply) => {
  const { day } = request.params
  const { user_id, title } = request.body || {}
  const uid = user_id ? Number(user_id) : 1

  if (!VALID_DAYS.includes(day)) {
    reply.code(400)
    return { error: 'Invalid day' }
  }
  const trimmed = (title || '').trim()
  if (!trimmed) {
    reply.code(400)
    return { error: 'title is required' }
  }

  db.prepare(
    `INSERT INTO day_plans (user_id, day, title) VALUES (?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET title = excluded.title`,
  ).run(uid, day, trimmed)

  return { day, title: trimmed }
})

const PROFILE_COLUMNS =
  'age, height, weight, goals, beginner_mode, workout_reminder, protein_reminder, workout_reminder_time, protein_reminder_delay_minutes, streak_freeze_until'

// Never select streak_guardian_hash/salt into an API response — the hash is
// derived here into a plain enabled/disabled boolean instead.
function loadProfile(uid) {
  const row = db.prepare(`SELECT ${PROFILE_COLUMNS} FROM user_profile WHERE id = ?`).get(uid)
  return { ...row, goals: row.goals ? JSON.parse(row.goals) : [], streak_guardian_enabled: streakGuardian.isEnabled(uid) }
}

fastify.get('/api/profile', async (request) => {
  const uid = request.query.user_id ? Number(request.query.user_id) : 1
  return loadProfile(uid)
})

fastify.put('/api/profile', async (request) => {
  const {
    user_id, age, height, weight, goals, beginner_mode,
    workout_reminder, protein_reminder, workout_reminder_time, protein_reminder_delay_minutes,
    streak_freeze_until,
  } = request.body || {}
  const uid = user_id ? Number(user_id) : 1
  db.prepare(
    `UPDATE user_profile SET age = ?, height = ?, weight = ?, goals = ?, beginner_mode = ?, workout_reminder = ?, protein_reminder = ?, workout_reminder_time = ?, protein_reminder_delay_minutes = ?, streak_freeze_until = ? WHERE id = ?`,
  ).run(
    age !== undefined ? age : null,
    height !== undefined ? height : null,
    weight !== undefined ? weight : null,
    goals !== undefined ? JSON.stringify(goals) : null,
    beginner_mode !== undefined ? (beginner_mode ? 1 : 0) : 0,
    workout_reminder !== undefined ? (workout_reminder ? 1 : 0) : 0,
    protein_reminder !== undefined ? (protein_reminder ? 1 : 0) : 0,
    workout_reminder_time || '08:00',
    protein_reminder_delay_minutes !== undefined ? protein_reminder_delay_minutes : 60,
    streak_freeze_until || null,
    uid,
  )
  streak.recomputeStreak(uid)
  return loadProfile(uid)
})

fastify.post('/api/streak-guardian/setup', async (request, reply) => {
  const { user_id, password } = request.body || {}
  const uid = user_id ? Number(user_id) : 1
  if (!password || !password.trim()) {
    reply.code(400)
    return { error: 'Password is required' }
  }
  streakGuardian.setup(uid, password)
  return { enabled: true }
})

fastify.post('/api/streak-guardian/disable', async (request, reply) => {
  const { user_id, password } = request.body || {}
  const uid = user_id ? Number(user_id) : 1
  const ok = streakGuardian.disable(uid, password || '')
  if (!ok) {
    reply.code(401)
    return { error: 'Incorrect password' }
  }
  return { enabled: false }
})

fastify.post('/api/streak-guardian/verify', async (request, reply) => {
  const { user_id, password } = request.body || {}
  const uid = user_id ? Number(user_id) : 1
  const ok = streakGuardian.verify(uid, password || '')
  if (!ok) {
    reply.code(401)
    return { error: 'Incorrect password' }
  }
  return { valid: true }
})

const VALID_SWAP_REASONS = ['hurts', 'new', 'unavailable', 'dislike', 'other']

fastify.post('/api/exercises/:id/swap', async (request, reply) => {
  const { id } = request.params
  const { reason, other_text } = request.body || {}

  if (!VALID_SWAP_REASONS.includes(reason)) {
    reply.code(400)
    return { error: 'Invalid reason' }
  }

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  const profileRow = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(existing.user_id)
  const profile = profileRow
    ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [], beginner_mode: !!profileRow.beginner_mode }
    : null

  const swapDayPlan = db.prepare('SELECT title FROM day_plans WHERE user_id = ? AND day = ?').get(existing.user_id, existing.day)
  const swapDayTitle = swapDayPlan?.title || null

  const exercise = {
    name: existing.name,
    description: existing.description,
    bullets: JSON.parse(existing.bullets),
  }

  let generated
  try {
    generated = await generateSwapExercise(exercise, reason, other_text || '', profile, swapDayTitle)
  } catch (err) {
    logError('POST /api/exercises/:id/swap', new Error(describeOpenAIError(err)))
    reply.code(502)
    return { error: 'Failed to generate replacement exercise' }
  }

  db.prepare(
    'UPDATE exercises SET name = ?, sets = ?, reps = ?, weight = ?, duration = ?, description = ?, bullets = ?, video_id = ?, category = ?, adjustments = ? WHERE id = ?',
  ).run(generated.name, generated.sets ?? null, generated.reps ?? null, generated.weight ?? null, generated.duration ?? null, generated.description, JSON.stringify(generated.bullets), generated.video_id || null, generated.category || null, '[]', id)

  // The exercise identity effectively changed — old chat history and any
  // per-exercise adjustment notes no longer apply.
  db.prepare('DELETE FROM chat_messages WHERE exercise_id = ?').run(id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return parseExerciseRow(updated)
})

fastify.post('/api/plan/structure', async (request, reply) => {
  const { user_id, days_per_week, start_day, beginner_mode, include_warm_up, include_stretch } = request.body || {}
  const uid = user_id ? Number(user_id) : 1

  if (!start_day || !VALID_DAYS.includes(start_day)) {
    reply.code(400)
    return { error: 'Invalid start_day' }
  }

  const profileRow = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(uid)
  const profile = profileRow
    ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [], beginner_mode: !!profileRow.beginner_mode }
    : null

  const settings = {
    daysPerWeek: Number(days_per_week) || 3,
    startDay: start_day,
    beginnerMode: beginner_mode ?? profile?.beginner_mode ?? false,
    includeWarmUp: include_warm_up ?? true,
    includeStretch: include_stretch ?? true,
  }

  function onLog(type, content) {
    try { writeLLMLog(uid, type, content) } catch {}
  }

  let plan
  try {
    plan = await generatePlanStructure(profile, settings, onLog)
  } catch (err) {
    logError('POST /api/plan/structure', new Error(describeOpenAIError(err)))
    reply.code(502)
    return { error: 'Failed to generate plan structure' }
  }

  // Clear existing data and write new day titles
  db.prepare('DELETE FROM chat_messages WHERE exercise_id IN (SELECT id FROM exercises WHERE user_id = ?)').run(uid)
  db.prepare('DELETE FROM exercises WHERE user_id = ?').run(uid)
  db.prepare('DELETE FROM day_plans WHERE user_id = ?').run(uid)
  const insertDayPlan = db.prepare('INSERT INTO day_plans (user_id, day, title) VALUES (?, ?, ?)')
  for (const day of plan.days) {
    insertDayPlan.run(uid, day.day, day.title)
  }

  return plan
})

fastify.patch('/api/exercises/:id', async (request, reply) => {
  const { id } = request.params
  const { sets, reps, weight, duration, adjustments } = request.body

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  const nextAdjustments = adjustments !== undefined
    ? JSON.stringify(adjustments)
    : (existing.adjustments ?? '[]')

  db.prepare('UPDATE exercises SET sets = ?, reps = ?, weight = ?, duration = ?, adjustments = ? WHERE id = ?')
    .run(sets ?? null, reps ?? null, weight ?? null, duration ?? null, nextAdjustments, id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return parseExerciseRow(updated)
})

// Applies one or more of Edit Plan's structural/field actions in a single
// request — reordering within a day, moving to another day, copying to
// another day, field edits (name/sets/reps/weight/duration/description/
// bullets), and deleting. Originally the whole-plan draft's "commit
// everything at once on Save" endpoint; now called immediately after each
// individual action instead (Edit Plan has no local draft/Save any more —
// every request here is small, usually touching just one array). `updates`
// always carries each existing row's full current field set (not just what
// changed) so the UPDATE below is a plain unconditional write, same idea as
// `copies` duplicating a full row. No AI involved; this only restructures/
// edits rows that already exist. copies/creates always start with a clean
// photo/adjustments slate rather than sharing state with their source.
// Returns the rows actually created/copied (same order as the request
// arrays) so the caller can learn their real ids immediately — there's no
// later Save response to learn them from any more.
fastify.post('/api/exercises/plan', async (request, reply) => {
  const { user_id, deletes, updates, copies, creates } = request.body || {}
  const uid = user_id ? Number(user_id) : 1

  for (const { id, day, sort_order, name, sets, reps, weight, duration, description, bullets, video_id, category } of updates || []) {
    if (!VALID_DAYS.includes(day)) continue
    db.prepare(
      `UPDATE exercises
       SET day = ?, sort_order = ?, name = ?, sets = ?, reps = ?, weight = ?, duration = ?, description = ?, bullets = ?, video_id = ?, category = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).run(day, sort_order, name, sets, reps, weight, duration, description, JSON.stringify(bullets), video_id ?? null, category ?? null, id, uid)
  }

  const copied = []
  for (const { sourceId, day, sort_order } of copies || []) {
    if (!VALID_DAYS.includes(day)) continue
    const source = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(sourceId, uid)
    if (!source) continue
    const result = db.prepare(
      `INSERT INTO exercises (user_id, name, day, sets, reps, weight, duration, description, bullets, video_id, category, sort_order, adjustments, photo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL)`,
    ).run(uid, source.name, day, source.sets, source.reps, source.weight, source.duration, source.description, source.bullets, source.video_id, source.category, sort_order)
    copied.push(parseExerciseRow(db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid)))
  }

  // Phase 4's manual-entry path — a brand new exercise with no source row to
  // copy from, unlike `copies`. Starts with the same clean adjustments/photo
  // slate as a copy does, since there's nothing prior to carry over here either.
  const created = []
  for (const { day, sort_order, name, sets, reps, weight, duration, description, bullets, video_id, category } of creates || []) {
    if (!VALID_DAYS.includes(day)) continue
    if (!name || !name.trim()) continue
    const result = db.prepare(
      `INSERT INTO exercises (user_id, name, day, sets, reps, weight, duration, description, bullets, video_id, category, sort_order, adjustments, photo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL)`,
    ).run(uid, name.trim(), day, sets ?? null, reps ?? null, weight ?? null, duration ?? null, description || '', JSON.stringify(bullets || []), video_id ?? null, category ?? null, sort_order)
    created.push(parseExerciseRow(db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid)))
  }

  // Soft-delete: flips deleted_at instead of removing the row, so it can be
  // restored exactly (same id, chat history, photo) via POST .../restore.
  // The photo file and chat history are left untouched here — only the
  // background sweep (exerciseSweep.js), once the row is past its grace
  // period and nothing can undo it any more, actually removes them.
  for (const id of deletes || []) {
    const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, uid)
    if (!existing) continue
    db.prepare('UPDATE exercises SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
  }

  return { ok: true, created, copied }
})

// Undoes a soft-delete — the exact inverse of the `deletes` loop above.
fastify.post('/api/exercises/:id/restore', async (request, reply) => {
  const { id } = request.params
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NOT NULL').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'No deleted exercise with that id' }
  }
  db.prepare('UPDATE exercises SET deleted_at = NULL WHERE id = ?').run(id)
  const restored = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return parseExerciseRow(restored)
})

// Uploaded photo: multipart file, decoded and re-encoded (see
// exercisePhotos.js for why that's the actual security boundary here, not
// just a size/type check). Replaces whatever photo was set before — if that
// was a local upload, the old file is marked orphaned (see photoSweep.js)
// rather than deleted outright, so Edit Plan's Undo can still point back at
// it. A URL has nothing to mark.
fastify.post('/api/exercises/:id/photo', async (request, reply) => {
  const { id } = request.params
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  const file = await request.file()
  if (!file) {
    reply.code(400)
    return { error: 'No photo uploaded' }
  }
  const buffer = await file.toBuffer()

  const filename = await exercisePhotos.saveUploadedPhoto(buffer)
  if (!filename) {
    reply.code(400)
    return { error: "That file isn't a valid image" }
  }

  if (exercisePhotos.isValidStoredFilename(existing.photo)) {
    photoSweep.markOrphaned(existing.photo)
  }
  db.prepare('UPDATE exercises SET photo = ? WHERE id = ?').run(filename, id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return parseExerciseRow(updated)
})

// External photo: just the URL string, validated and stored as-is — never
// fetched by the backend (see exercisePhotos.isValidPhotoUrl for why).
fastify.put('/api/exercises/:id/photo', async (request, reply) => {
  const { id } = request.params
  const { url } = request.body || {}

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  if (!exercisePhotos.isValidPhotoUrl(url)) {
    reply.code(400)
    return { error: 'url must be a valid https:// link' }
  }

  if (exercisePhotos.isValidStoredFilename(existing.photo)) {
    photoSweep.markOrphaned(existing.photo)
  }
  db.prepare('UPDATE exercises SET photo = ? WHERE id = ?').run(url, id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return parseExerciseRow(updated)
})

fastify.delete('/api/exercises/:id/photo', async (request, reply) => {
  const { id } = request.params
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  if (exercisePhotos.isValidStoredFilename(existing.photo)) {
    photoSweep.markOrphaned(existing.photo)
  }
  db.prepare('UPDATE exercises SET photo = NULL WHERE id = ?').run(id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return parseExerciseRow(updated)
})

// Points `photo` directly at a previously-known value — a filename we
// generated, a URL, or null — without re-uploading anything. Used only by
// Edit Plan's Undo/Redo to revert a photo change: the old file is still on
// disk (marked orphaned, not deleted, by the endpoints above) as long as
// it's within its grace period, so undoing just needs to re-point the
// column and clear the orphan mark. Not reachable with arbitrary text: a
// non-URL, non-null value must match our own generated-filename pattern, so
// this can never be used to point `photo` at something we didn't create.
fastify.post('/api/exercises/:id/photo/revert', async (request, reply) => {
  const { id } = request.params
  const { photo } = request.body || {}

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  if (photo !== null && !exercisePhotos.isValidPhotoUrl(photo) && !exercisePhotos.isValidStoredFilename(photo)) {
    reply.code(400)
    return { error: 'Invalid photo value' }
  }
  if (photo && exercisePhotos.isValidStoredFilename(photo) && !(await exercisePhotos.storedPhotoExists(photo))) {
    reply.code(409)
    return { error: 'That photo is no longer available' }
  }

  if (exercisePhotos.isValidStoredFilename(existing.photo)) {
    photoSweep.markOrphaned(existing.photo)
  }
  if (photo && exercisePhotos.isValidStoredFilename(photo)) {
    photoSweep.unmarkOrphaned(photo)
  }
  db.prepare('UPDATE exercises SET photo = ? WHERE id = ?').run(photo, id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return parseExerciseRow(updated)
})

// Image search for the Edit Plan photo picker — Serper.dev's /images
// endpoint. Only ever returns URLs for the client to render/pick from (the
// same "URLs only, never fetched server-side" model as the PUT .../photo
// endpoint above) — never downloads or stores the images itself. Returns
// 503 rather than erroring hard when the key isn't configured, since this
// is optional and the rest of Edit Plan works without it.
fastify.get('/api/image-search', async (request, reply) => {
  const q = (request.query.q || '').trim()
  if (!q) {
    reply.code(400)
    return { error: 'q is required' }
  }

  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    reply.code(503)
    return { error: 'Image search is not configured' }
  }

  let data
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num: 9, safe: 'active' }),
    })
    if (!res.ok) throw new Error(`Serper returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logError('GET /api/image-search', err)
    reply.code(502)
    return { error: 'Image search failed' }
  }

  // GIFs turn out to be a genuinely better fit for an exercise photo than a
  // static frame — they show the actual movement — so surface them first
  // rather than leaving it to whatever order Serper happened to return.
  // Detected off the URL's extension since Serper doesn't expose a format
  // field; not perfect (an extensionless GIF slips through unmarked) but a
  // reasonable, cheap signal.
  const isGif = (url) => /\.gif(\?|$)/i.test(url || '')
  const results = (data.images || [])
    .map((item) => ({
      url: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl || item.imageUrl,
      isGif: isGif(item.imageUrl),
    }))
    .sort((a, b) => Number(b.isGif) - Number(a.isGif))
  return { results }
})

// Video search for the Edit Plan YouTube picker — reuses searchYouTube from
// openai.js, the same YouTube Data API lookup the AI pipeline already uses
// to auto-attach a demo clip when generating an exercise (see
// findVideoForExercise). Same <60s-clip filter applies here too, since the
// use case is identical: a short form/technique demo, not a full workout.
fastify.get('/api/youtube-search', async (request, reply) => {
  const q = (request.query.q || '').trim()
  if (!q) {
    reply.code(400)
    return { error: 'q is required' }
  }

  let results
  try {
    results = await searchYouTube(q)
  } catch (err) {
    logError('GET /api/youtube-search', err)
    reply.code(502)
    return { error: 'YouTube search failed' }
  }
  return { results }
})

// Live autocomplete for Edit Plan's "Title search" add-exercise mode —
// local word-boundary match against the bundled wger name list (see
// EXERCISE_NAMES above), not a network call, so it's fast enough to hit on
// every keystroke. The query must align with the START of a word inside the
// name (e.g. "lock" matches "Lockout" or "Kettlebell Lock..."), not appear
// as an arbitrary mid-word substring (e.g. "lock" must NOT match
// "clockwise" — the query would land mid-word there). Names whose *first*
// word matches rank above names matching on a later word, then alphabetical.
// Hyphens and spaces are treated as interchangeable on both sides of the
// match — "Push Up" should find "Push-Up" and vice versa, since that's just
// an inconsistent-formatting difference, not a different exercise.
function normalizeForSearch(s) {
  return s.toLowerCase().replace(/[-\s]+/g, ' ').trim()
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

fastify.get('/api/exercise-name-search', async (request) => {
  const q = normalizeForSearch(request.query.q || '')
  if (!q) return { results: [] }

  const wordStartRe = new RegExp(`\\b${escapeRegex(q)}`, 'i')
  const starts = []
  const contains = []
  for (const name of EXERCISE_NAMES) {
    const normalized = normalizeForSearch(name)
    if (!wordStartRe.test(normalized)) continue
    if (normalized.startsWith(q)) starts.push(name)
    else contains.push(name)
  }
  starts.sort((a, b) => a.localeCompare(b))
  contains.sort((a, b) => a.localeCompare(b))

  return { results: [...starts, ...contains].slice(0, 8) }
})

// Only ever serves a filename matching our own generated pattern, from the
// one fixed directory — path traversal is closed off by that check, not by
// trusting anything about the request. nosniff plus an explicit content type
// means the browser never re-interprets this as anything but an image.
fastify.get('/api/exercise-photos/:filename', async (request, reply) => {
  const { filename } = request.params
  if (!exercisePhotos.isValidStoredFilename(filename)) {
    reply.code(400)
    return { error: 'Invalid filename' }
  }

  const filePath = path.join(exercisePhotos.EXERCISE_PHOTOS_DIR, filename)
  try {
    const data = await fs.promises.readFile(filePath)
    reply
      .header('Content-Type', 'image/webp')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(data)
  } catch {
    reply.code(404)
    return { error: 'Photo not found' }
  }
})

function parseChatMessage(row) {
  return { ...row, proposals: row.proposals ? JSON.parse(row.proposals) : [] }
}

const insertChatMessageStmt = db.prepare(
  'INSERT INTO chat_messages (exercise_id, role, text, proposals, token_count) VALUES (?, ?, ?, ?, ?)',
)

function insertChatMessage(exerciseId, role, text, proposals) {
  return insertChatMessageStmt.run(exerciseId, role, text, proposals && proposals.length > 0 ? JSON.stringify(proposals) : null, countTokens(text))
}

fastify.get('/api/exercises/:id/chat', async (request) => {
  const { id } = request.params
  const selectAll = db.prepare('SELECT id, role, text, proposals, created_at FROM chat_messages WHERE exercise_id = ? ORDER BY id ASC')

  const existing = selectAll.all(id)
  if (existing.length > 0) return existing.map(parseChatMessage)

  const exercise = db.prepare('SELECT name FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!exercise) return []

  const greeting = `Ask me anything about ${exercise.name} — form cues, alternatives, or why it's in your plan.`
  insertChatMessage(id, 'assistant', greeting, null)
  return selectAll.all(id).map(parseChatMessage)
})

fastify.post('/api/exercises/:id/chat', async (request, reply) => {
  const { id } = request.params
  const { text } = request.body || {}

  if (!text || !text.trim()) {
    reply.code(400)
    return { error: 'text is required' }
  }

  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!exercise) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  const selectById = db.prepare('SELECT id, role, text, proposals, created_at FROM chat_messages WHERE id = ?')

  const userResult = insertChatMessage(id, 'user', text.trim(), null)
  const userMessage = parseChatMessage(selectById.get(userResult.lastInsertRowid))

  const profileRow = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(exercise.user_id)
  const profile = profileRow
    ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [], beginner_mode: !!profileRow.beginner_mode }
    : null

  const history = db.prepare('SELECT role, text, token_count FROM chat_messages WHERE exercise_id = ? ORDER BY id ASC').all(id)

  let generated
  try {
    generated = await generateChatReply(exercise, profile, history)
  } catch (err) {
    logError(`POST /api/exercises/${id}/chat`, new Error(describeOpenAIError(err)))
    reply.code(502)
    return { error: 'Failed to generate reply', userMessage }
  }

  const assistantResult = insertChatMessage(id, 'assistant', generated.text || '', generated.proposals)
  const assistantMessage = parseChatMessage(selectById.get(assistantResult.lastInsertRowid))

  reply.code(201)
  return { userMessage, assistantMessage }
})

function diffStatChange(existing, payload) {
  const parts = []
  const fields = [
    ['weight', 'weight', (v) => `${v} kg`],
    ['reps', 'reps', (v) => `${v}`],
    ['sets', 'sets', (v) => `${v}`],
    ['duration', 'duration', (v) => `${v}s`],
  ]
  for (const [key, label, fmt] of fields) {
    const before = existing[key]
    const after = payload[key] ?? null
    if (before !== after && (before != null || after != null)) {
      parts.push(`${label} ${before != null ? fmt(before) : '—'} → ${after != null ? fmt(after) : '—'}`)
    }
  }
  return parts
}

fastify.post('/api/exercises/:id/chat/confirm', async (request, reply) => {
  const { id } = request.params
  const { type, payload } = request.body || {}

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  const selectMessageById = db.prepare('SELECT id, role, text, proposals, created_at FROM chat_messages WHERE id = ?')

  if (type === 'stat_change') {
    const { sets, reps, weight, duration } = payload || {}
    const parts = diffStatChange(existing, payload || {})

    db.prepare('UPDATE exercises SET sets = ?, reps = ?, weight = ?, duration = ? WHERE id = ?')
      .run(sets ?? null, reps ?? null, weight ?? null, duration ?? null, id)

    const confirmText = parts.length > 0 ? `Updated: ${parts.join(', ')}.` : 'Updated the exercise stats.'
    const result = insertChatMessage(id, 'assistant', confirmText, null)
    const confirmationMessage = parseChatMessage(selectMessageById.get(result.lastInsertRowid))

    const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
    return { updatedExercise: parseExerciseRow(updated), confirmationMessage, historyReset: false }
  }

  if (type === 'swap') {
    const { reason, other_text } = payload || {}
    if (!VALID_SWAP_REASONS.includes(reason)) {
      reply.code(400)
      return { error: 'Invalid reason' }
    }

    const profileRow = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(existing.user_id)
    const profile = profileRow
      ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [], beginner_mode: !!profileRow.beginner_mode }
      : null

    const swapDayPlan = db.prepare('SELECT title FROM day_plans WHERE user_id = ? AND day = ?').get(existing.user_id, existing.day)
    const swapDayTitle = swapDayPlan?.title || null

    const exercise = { name: existing.name, description: existing.description, bullets: JSON.parse(existing.bullets) }

    let generated
    try {
      generated = await generateSwapExercise(exercise, reason, other_text || '', profile, swapDayTitle)
    } catch (err) {
      logError('POST /api/exercises/:id/chat/confirm (swap)', new Error(describeOpenAIError(err)))
      reply.code(502)
      return { error: 'Failed to generate replacement exercise' }
    }

    db.prepare(
      'UPDATE exercises SET name = ?, sets = ?, reps = ?, weight = ?, duration = ?, description = ?, bullets = ?, video_id = ?, category = ?, adjustments = ? WHERE id = ?',
    ).run(generated.name, generated.sets ?? null, generated.reps ?? null, generated.weight ?? null, generated.duration ?? null, generated.description, JSON.stringify(generated.bullets), generated.video_id || null, generated.category || null, '[]', id)

    db.prepare('DELETE FROM chat_messages WHERE exercise_id = ?').run(id)

    const result = insertChatMessage(id, 'assistant', `Swapped to ${generated.name}.`, null)
    const confirmationMessage = parseChatMessage(selectMessageById.get(result.lastInsertRowid))

    const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
    return { updatedExercise: parseExerciseRow(updated), confirmationMessage, historyReset: true }
  }

  if (type === 'video_change') {
    let videoId = null
    try {
      videoId = await findVideoForExercise(existing.name)
    } catch (err) {
      logError('POST /api/exercises/:id/chat/confirm (video)', new Error(describeOpenAIError(err)))
    }

    let confirmText
    let confirmProposals = null
    if (videoId) {
      db.prepare('UPDATE exercises SET video_id = ? WHERE id = ?').run(videoId, id)
      confirmText = 'Updated the demo video.'
      confirmProposals = [{ id: crypto.randomUUID(), type: 'watch_video', payload: { video_id: videoId } }]
    } else {
      confirmText = "Couldn't find a better video — kept the current one."
    }

    const result = insertChatMessage(id, 'assistant', confirmText, confirmProposals)
    const confirmationMessage = parseChatMessage(selectMessageById.get(result.lastInsertRowid))

    const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
    return { updatedExercise: parseExerciseRow(updated), confirmationMessage, historyReset: false }
  }

  reply.code(400)
  return { error: 'Invalid proposal type' }
})

fastify.post('/api/workout-log/complete', async (request, reply) => {
  const { user_id, scheduled_date, performed_date } = request.body || {}
  const uid = user_id ? Number(user_id) : 1

  if (!scheduled_date || !/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) {
    reply.code(400)
    return { error: 'scheduled_date is required (YYYY-MM-DD)' }
  }

  const scheduledWeekdays = streak.getScheduledWeekdays(uid)
  if (!scheduledWeekdays.has(streak.weekdayName(scheduled_date))) {
    reply.code(400)
    return { error: 'scheduled_date is not one of this user\'s scheduled workout days' }
  }

  const result = streak.markPerformed(uid, scheduled_date, performed_date)
  if (!result) {
    reply.code(404)
    return { error: 'No scheduled workout found for that date' }
  }

  // Only queue the protein reminder for a "just finished" completion (today),
  // not a backfilled/past performed_date.
  if ((performed_date || streak.todayISODate()) === streak.todayISODate()) {
    const profile = db.prepare(
      'SELECT protein_reminder, protein_reminder_delay_minutes FROM user_profile WHERE id = ?',
    ).get(uid)
    if (profile?.protein_reminder) {
      push.scheduleProteinReminder(uid, profile.protein_reminder_delay_minutes || 60)
    }
  }

  return result
})

// Reverses the completion above — for accidentally pressing "Complete
// Workout" or the swipe that finished the last exercise. Also cancels the
// protein reminder /complete may have just queued, since the workout it was
// for didn't actually happen (from the app's perspective).
fastify.post('/api/workout-log/uncomplete', async (request, reply) => {
  const { user_id, scheduled_date } = request.body || {}
  const uid = user_id ? Number(user_id) : 1

  if (!scheduled_date || !/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) {
    reply.code(400)
    return { error: 'scheduled_date is required (YYYY-MM-DD)' }
  }

  const result = streak.markUnperformed(uid, scheduled_date)
  if (!result) {
    reply.code(404)
    return { error: 'No scheduled workout found for that date' }
  }

  db.prepare('UPDATE user_profile SET protein_reminder_pending_at = NULL WHERE id = ?').run(uid)

  return result
})

fastify.get('/api/workout-log/streak', async (request) => {
  const uid = request.query.user_id ? Number(request.query.user_id) : 1
  return streak.recomputeStreak(uid)
})

fastify.get('/api/workout-log/history', async (request) => {
  const uid = request.query.user_id ? Number(request.query.user_id) : 1
  return streak.getHistory(uid)
})

fastify.get('/api/push/vapid-public-key', async (request, reply) => {
  if (!push.pushEnabled) {
    reply.code(503)
    return { error: 'Push notifications are not configured' }
  }
  return { publicKey: push.VAPID_PUBLIC_KEY }
})

fastify.post('/api/push/subscribe', async (request, reply) => {
  const { user_id, subscription } = request.body || {}
  const uid = user_id ? Number(user_id) : 1
  if (!subscription?.endpoint || !subscription?.keys) {
    reply.code(400)
    return { error: 'Invalid subscription' }
  }
  push.saveSubscription(uid, subscription)
  reply.code(204)
})

fastify.post('/api/push/unsubscribe', async (request, reply) => {
  const { user_id, endpoint } = request.body || {}
  const uid = user_id ? Number(user_id) : 1
  if (!endpoint) {
    reply.code(400)
    return { error: 'endpoint is required' }
  }
  push.removeSubscription(uid, endpoint)
  reply.code(204)
})

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    logError('startup', err)
    process.exit(1)
  }
  logStartup(PORT)
  if (isTailscaleConnected()) {
    logInfo('Tailscale: connected')
  } else {
    logWarn('Tailscale: not connected')
  }
  push.startScheduler()
})
