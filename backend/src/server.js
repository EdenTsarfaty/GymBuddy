const fastify = require('fastify')({ logger: false })
const db = require('./db')
const { generateExerciseData, generateSwapExercise, generatePlanStructure, generateChatReply, findVideoForExercise, checkOpenAIHealth, describeOpenAIError } = require('./openai')
const { writeLLMLog, logRequest, logError, logInfo, logCli, logCliBlock, logStartup, cli } = require('./logger')
const { maybeBackupDatabase } = require('./backup')
const { countTokens } = require('./tokenizer')

maybeBackupDatabase()

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
    ? db.prepare('SELECT * FROM exercises WHERE day = ? AND user_id = ?').all(day, uid)
    : db.prepare('SELECT * FROM exercises WHERE user_id = ?').all(uid)

  return rows.map((row) => ({ ...row, bullets: JSON.parse(row.bullets) }))
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

  const insert = db.prepare(
    'INSERT INTO exercises (user_id, name, day, sets, reps, weight, duration, description, bullets, video_id, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
  )

  const created = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid)
  reply.code(201)
  return { ...created, bullets: JSON.parse(created.bullets) }
})

fastify.get('/api/day-plans', async (request) => {
  const uid = request.query.user_id ? Number(request.query.user_id) : 1
  return db.prepare('SELECT day, title FROM day_plans WHERE user_id = ?').all(uid)
})

fastify.get('/api/profile', async (request) => {
  const uid = request.query.user_id ? Number(request.query.user_id) : 1
  const row = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(uid)
  return { ...row, goals: row.goals ? JSON.parse(row.goals) : [] }
})

fastify.put('/api/profile', async (request) => {
  const { user_id, age, height, weight, goals, beginner_mode } = request.body || {}
  const uid = user_id ? Number(user_id) : 1
  db.prepare(
    'UPDATE user_profile SET age = ?, height = ?, weight = ?, goals = ?, beginner_mode = ? WHERE id = ?',
  ).run(
    age !== undefined ? age : null,
    height !== undefined ? height : null,
    weight !== undefined ? weight : null,
    goals !== undefined ? JSON.stringify(goals) : null,
    beginner_mode !== undefined ? (beginner_mode ? 1 : 0) : 0,
    uid,
  )
  const row = db.prepare('SELECT age, height, weight, goals, beginner_mode FROM user_profile WHERE id = ?').get(uid)
  return { ...row, goals: row.goals ? JSON.parse(row.goals) : [] }
})

const VALID_SWAP_REASONS = ['hurts', 'new', 'unavailable', 'other']

fastify.post('/api/exercises/:id/swap', async (request, reply) => {
  const { id } = request.params
  const { reason, other_text } = request.body || {}

  if (!VALID_SWAP_REASONS.includes(reason)) {
    reply.code(400)
    return { error: 'Invalid reason' }
  }

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
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
    'UPDATE exercises SET name = ?, sets = ?, reps = ?, weight = ?, duration = ?, description = ?, bullets = ?, video_id = ?, category = ? WHERE id = ?',
  ).run(generated.name, generated.sets ?? null, generated.reps ?? null, generated.weight ?? null, generated.duration ?? null, generated.description, JSON.stringify(generated.bullets), generated.video_id || null, generated.category || null, id)

  // The exercise identity effectively changed — old chat history no longer applies.
  db.prepare('DELETE FROM chat_messages WHERE exercise_id = ?').run(id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return { ...updated, bullets: JSON.parse(updated.bullets) }
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
  const { sets, reps, weight, duration } = request.body

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  db.prepare('UPDATE exercises SET sets = ?, reps = ?, weight = ?, duration = ? WHERE id = ?').run(sets ?? null, reps ?? null, weight ?? null, duration ?? null, id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return { ...updated, bullets: JSON.parse(updated.bullets) }
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

  const exercise = db.prepare('SELECT name FROM exercises WHERE id = ?').get(id)
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

  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
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

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
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
    return { updatedExercise: { ...updated, bullets: JSON.parse(updated.bullets) }, confirmationMessage, historyReset: false }
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
      'UPDATE exercises SET name = ?, sets = ?, reps = ?, weight = ?, duration = ?, description = ?, bullets = ?, video_id = ?, category = ? WHERE id = ?',
    ).run(generated.name, generated.sets ?? null, generated.reps ?? null, generated.weight ?? null, generated.duration ?? null, generated.description, JSON.stringify(generated.bullets), generated.video_id || null, generated.category || null, id)

    db.prepare('DELETE FROM chat_messages WHERE exercise_id = ?').run(id)

    const result = insertChatMessage(id, 'assistant', `Swapped to ${generated.name}.`, null)
    const confirmationMessage = parseChatMessage(selectMessageById.get(result.lastInsertRowid))

    const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
    return { updatedExercise: { ...updated, bullets: JSON.parse(updated.bullets) }, confirmationMessage, historyReset: true }
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
    return { updatedExercise: { ...updated, bullets: JSON.parse(updated.bullets) }, confirmationMessage, historyReset: false }
  }

  reply.code(400)
  return { error: 'Invalid proposal type' }
})

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    logError('startup', err)
    process.exit(1)
  }
  logStartup(PORT)
})
