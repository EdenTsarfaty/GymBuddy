const fastify = require('fastify')({ logger: true })
const db = require('./db')
const { generateExerciseData, generateSwapExercise } = require('./openai')

const PORT = process.env.PORT || 3001
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

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

  const profileRow = db.prepare('SELECT age, height, weight, goals FROM user_profile WHERE id = ?').get(uid)
  const profile = profileRow
    ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [] }
    : null

  let generated
  try {
    generated = await generateExerciseData(title.trim(), profile)
  } catch (err) {
    request.log.error(err)
    reply.code(502)
    return { error: 'Failed to generate exercise data' }
  }

  const insert = db.prepare(
    'INSERT INTO exercises (user_id, name, day, sets, weight, description, bullets) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  const result = insert.run(
    uid,
    title.trim(),
    day || currentDayName(),
    generated.sets,
    generated.weight,
    generated.description,
    JSON.stringify(generated.bullets),
  )

  const created = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid)
  reply.code(201)
  return { ...created, bullets: JSON.parse(created.bullets) }
})

fastify.get('/api/profile', async (request) => {
  const uid = request.query.user_id ? Number(request.query.user_id) : 1
  const row = db.prepare('SELECT age, height, weight, goals FROM user_profile WHERE id = ?').get(uid)
  return { ...row, goals: row.goals ? JSON.parse(row.goals) : [] }
})

fastify.put('/api/profile', async (request) => {
  const { user_id, age, height, weight, goals } = request.body || {}
  const uid = user_id ? Number(user_id) : 1
  db.prepare(
    'UPDATE user_profile SET age = ?, height = ?, weight = ?, goals = ? WHERE id = ?',
  ).run(
    age !== undefined ? age : null,
    height !== undefined ? height : null,
    weight !== undefined ? weight : null,
    goals !== undefined ? JSON.stringify(goals) : null,
    uid,
  )
  const row = db.prepare('SELECT age, height, weight, goals FROM user_profile WHERE id = ?').get(uid)
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

  const profileRow = db.prepare('SELECT age, height, weight, goals FROM user_profile WHERE id = ?').get(existing.user_id)
  const profile = profileRow
    ? { ...profileRow, goals: profileRow.goals ? JSON.parse(profileRow.goals) : [] }
    : null

  const exercise = {
    name: existing.name,
    description: existing.description,
    bullets: JSON.parse(existing.bullets),
  }

  let generated
  try {
    generated = await generateSwapExercise(exercise, reason, other_text || '', profile)
  } catch (err) {
    request.log.error(err)
    reply.code(502)
    return { error: 'Failed to generate replacement exercise' }
  }

  db.prepare(
    'UPDATE exercises SET name = ?, sets = ?, weight = ?, description = ?, bullets = ? WHERE id = ?',
  ).run(generated.name, generated.sets, generated.weight, generated.description, JSON.stringify(generated.bullets), id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return { ...updated, bullets: JSON.parse(updated.bullets) }
})

fastify.patch('/api/exercises/:id', async (request, reply) => {
  const { id } = request.params
  const { sets, weight } = request.body

  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  if (!existing) {
    reply.code(404)
    return { error: 'Exercise not found' }
  }

  db.prepare('UPDATE exercises SET sets = ?, weight = ? WHERE id = ?').run(sets, weight, id)

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id)
  return { ...updated, bullets: JSON.parse(updated.bullets) }
})

fastify.listen({ port: PORT }, (err) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
