const OPENAI_MODEL = 'gpt-5.4-nano'

const GOAL_LABELS = {
  lose_weight:   'I want to lose weight',
  stay_healthy:  'I want to stay healthy',
  look_better:   'I want a better looking body',
  get_stronger:  'I want to get stronger',
  endurance:     'I want better endurance',
  mental_health: 'I want to improve my mental wellbeing',
  daily_energy:  'I want to boost my daily energy levels',
}

function buildSystemPrompt(profile) {
  const lines = [
    'You are a fitness coach filling in workout tracker data for a given exercise name. Respond only with the requested fields.',
    '',
    '## User profile',
  ]

  if (profile) {
    if (profile.age != null)    lines.push(`Age: ${profile.age}`)
    if (profile.height != null) lines.push(`Height: ${profile.height} cm`)
    if (profile.weight != null) lines.push(`Weight: ${profile.weight} kg`)

    const goals = Array.isArray(profile.goals) ? profile.goals : []
    if (goals.length > 0) {
      lines.push('')
      lines.push('## User declared goals for working out')
      for (const id of goals) {
        const label = GOAL_LABELS[id]
        if (label) lines.push(`* ${label}`)
      }
    }
  }

  lines.push('')
  lines.push('Use the profile and goals to personalise starting weight and set recommendations where relevant.')
  lines.push('Always use the search_youtube tool to find the best instructional video for the exercise before responding.')

  return lines.join('\n')
}

// ── YouTube tool ──────────────────────────────────────────────────────────────

const YOUTUBE_TOOL = {
  type: 'function',
  function: {
    name: 'search_youtube',
    description: 'Search YouTube for exercise demonstration and tutorial videos. Returns results with title, channel, view count, duration, and video ID. Always call this to find the best instructional video for an exercise.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query, e.g. "barbell squat tutorial proper form"',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
  },
}

function parseDuration(iso) {
  if (!iso) return ''
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return iso
  const h = m[1] ? `${m[1]}h ` : ''
  const min = m[2] ? `${m[2]}m ` : ''
  const s = m[3] ? `${m[3]}s` : ''
  return `${h}${min}${s}`.trim()
}

async function searchYouTube(query) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []

  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: 8,
    order: 'relevance',
    key,
  })
  const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`)
  if (!searchRes.ok) return []
  const searchData = await searchRes.json()
  const items = searchData.items || []
  if (items.length === 0) return []

  const ids = items.map((i) => i.id.videoId).join(',')
  const statsParams = new URLSearchParams({ part: 'statistics,contentDetails', id: ids, key })
  const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${statsParams}`)
  const statsData = statsRes.ok ? await statsRes.json() : { items: [] }
  const statsMap = {}
  for (const item of statsData.items || []) {
    statsMap[item.id] = {
      views: parseInt(item.statistics?.viewCount || '0', 10),
      duration: parseDuration(item.contentDetails?.duration || ''),
    }
  }

  return items.map((item) => {
    const videoId = item.id.videoId
    const stats = statsMap[videoId] || {}
    return {
      video_id: videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      description: (item.snippet.description || '').slice(0, 150),
      views: stats.views || 0,
      duration: stats.duration || '',
    }
  })
}

function formatYouTubeResults(results) {
  if (!results || results.length === 0) return 'No results found.'
  return results
    .map((r, i) =>
      `${i + 1}. "${r.title}" | Channel: ${r.channel} | Views: ${r.views.toLocaleString()} | Duration: ${r.duration} | ID: ${r.video_id}\n   ${r.description}`,
    )
    .join('\n\n')
}

// ── Shared OpenAI caller ──────────────────────────────────────────────────────

async function callOpenAI(body) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI request failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function runWithTools(messages, schema, schemaName) {
  while (true) {
    const isFirst = messages.filter((m) => m.role === 'user').length === 1 &&
      messages[messages.length - 1].role === 'user'

    const data = await callOpenAI({
      model: OPENAI_MODEL,
      messages,
      tools: [YOUTUBE_TOOL],
      tool_choice: isFirst ? 'required' : 'auto',
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    })

    const choice = data.choices[0]
    messages.push(choice.message)

    if (choice.finish_reason === 'tool_calls') {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function.name === 'search_youtube') {
          const { query } = JSON.parse(toolCall.function.arguments)
          const results = await searchYouTube(query)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: formatYouTubeResults(results),
          })
        }
      }
    } else {
      return JSON.parse(choice.message.content)
    }
  }
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const EXERCISE_SCHEMA = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'A one to two sentence description of the exercise and the muscles it targets.',
    },
    bullets: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Three short, imperative-form coaching cues for correct form.',
    },
    weight: {
      type: 'number',
      description: 'A reasonable starting weight in kilograms for a beginner-to-intermediate lifter.',
    },
    sets: {
      type: 'integer',
      description: 'A reasonable number of working sets, typically 3-4.',
    },
    video_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'YouTube video ID of the best instructional video found via search_youtube.',
    },
  },
  required: ['description', 'bullets', 'weight', 'sets', 'video_id'],
  additionalProperties: false,
}

const SWAP_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'The name of the replacement exercise.',
    },
    description: {
      type: 'string',
      description: 'A one to two sentence description of the exercise and the muscles it targets.',
    },
    bullets: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Three short, imperative-form coaching cues for correct form.',
    },
    weight: {
      type: 'number',
      description: 'A reasonable starting weight in kilograms for a beginner-to-intermediate lifter.',
    },
    sets: {
      type: 'integer',
      description: 'A reasonable number of working sets, typically 3-4.',
    },
    video_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'YouTube video ID of the best instructional video found via search_youtube.',
    },
  },
  required: ['name', 'description', 'bullets', 'weight', 'sets', 'video_id'],
  additionalProperties: false,
}

// ── Public functions ──────────────────────────────────────────────────────────

async function generateExerciseData(title, profile) {
  return runWithTools(
    [
      { role: 'system', content: buildSystemPrompt(profile) },
      { role: 'user', content: `Exercise: ${title}` },
    ],
    EXERCISE_SCHEMA,
    'exercise_data',
  )
}

async function generateSwapExercise(exercise, reason, otherText, profile) {
  const REASON_LABELS = {
    hurts:       'This exercise hurts',
    new:         'I want a new exercise',
    unavailable: 'This exercise is unavailable in my gym',
    other:       otherText || 'Other',
  }

  const reasonText = REASON_LABELS[reason] || REASON_LABELS.other
  const userMessage = [
    `Exercise: ${exercise.name}`,
    `Description: ${exercise.description}`,
    `Instructions: ${exercise.bullets.join(' | ')}`,
    '',
    `The user has asked to replace this exercise for the reason: ${reasonText}. Find a replacement exercise addressing his concern, while retaining the same muscle groups focus as the original exercise.`,
  ].join('\n')

  return runWithTools(
    [
      { role: 'system', content: buildSystemPrompt(profile) },
      { role: 'user', content: userMessage },
    ],
    SWAP_SCHEMA,
    'swap_exercise_data',
  )
}

module.exports = { generateExerciseData, generateSwapExercise }
