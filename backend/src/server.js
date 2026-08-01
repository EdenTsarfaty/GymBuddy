const fastify = require('fastify')({ logger: true })
const db = require('./db')
const { generateExerciseData } = require('./openai')

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

fastify.get('/api/exercises', async (request, reply) => {
  const { day } = request.query

  if (day && !VALID_DAYS.includes(day)) {
    reply.code(400)
    return { error: 'Invalid day' }
  }

  const rows = day
    ? db.prepare('SELECT * FROM exercises WHERE day = ?').all(day)
    : db.prepare('SELECT * FROM exercises').all()

  return rows.map((row) => ({ ...row, bullets: JSON.parse(row.bullets) }))
})

fastify.post('/api/exercises/generate', async (request, reply) => {
  const { title, day } = request.body || {}

  if (!title || !title.trim()) {
    reply.code(400)
    return { error: 'title is required' }
  }

  if (day && !VALID_DAYS.includes(day)) {
    reply.code(400)
    return { error: 'Invalid day' }
  }

  let generated
  try {
    generated = await generateExerciseData(title.trim())
  } catch (err) {
    request.log.error(err)
    reply.code(502)
    return { error: 'Failed to generate exercise data' }
  }

  const insert = db.prepare(
    'INSERT INTO exercises (name, day, sets, weight, description, bullets) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const result = insert.run(
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
