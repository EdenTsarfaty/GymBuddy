const fastify = require('fastify')({ logger: true })
const db = require('./db')

const PORT = process.env.PORT || 3001
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

fastify.register(require('@fastify/cors'), {
  origin: FRONTEND_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
})

fastify.get('/api/health', async () => {
  return { status: 'ok' }
})

fastify.get('/api/exercises', async () => {
  const rows = db.prepare('SELECT * FROM exercises').all()
  return rows.map((row) => ({ ...row, bullets: JSON.parse(row.bullets) }))
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
