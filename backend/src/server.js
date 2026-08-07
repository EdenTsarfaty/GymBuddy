const fastify = require('fastify')({ logger: false })
const db = require('./db')
const { generateExerciseData, generateSwapExercise, generatePlanStructure } = require('./openai')
const { writeLLMLog, logRequest, logError, logStartup } = require('./logger')

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
    logError('POST /api/exercises/generate', err)
    reply.code(502)
    return { error: 'Failed to generate exercise data' }
  }

  const insert = db.prepare(
    'INSERT INTO exercises (user_id, name, day, sets, weight, duration, description, bullets, video_id, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const result = insert.run(
    uid,
    title.trim(),
    effectiveDay,
    generated.sets ?? null,
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
    logError('POST /api/exercises/:id/swap', err)
    reply.code(502)
    return { error: 'Failed to generate replacement exercise' }
  }

  db.prepare(
    'UPDATE exercises SET name = ?, sets = ?, weight = ?, duration = ?, description = ?, bullets = ?, video_id = ?, category = ? WHERE id = ?',
  ).run(generated.name, generated.sets ?? null, generated.weight ?? null, generated.duration ?? null, generated.description, JSON.stringify(generated.bullets), generated.video_id || null, generated.category || null, id)

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
    logError('POST /api/plan/structure', err)
    reply.code(502)
    return { error: 'Failed to generate plan structure' }
  }

  // Clear existing data and write new day titles
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
  const { sets, weight, duration } = request.body

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  db.prepare('UPDATE exercises SET sets = ?, weight = ?, duration = ? WHERE id = ?').run(sets ?? null, weight ?? null, duration ?? null, id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return { ...updated, bullets: JSON.parse(updated.bullets) }
})

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    logError('startup', err)
    process.exit(1)
  }
  logStartup(PORT)
})
