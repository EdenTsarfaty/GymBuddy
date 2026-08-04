const OPENAI_MODEL = 'gpt-5.4-nano'
const PLAN_MODEL = 'gpt-5.4-mini'

const GOAL_LABELS = {
  lose_weight:   'I want to lose weight',
  stay_healthy:  'I want to stay healthy',
  look_better:   'I want a better looking body',
  get_stronger:  'I want to get stronger',
  endurance:     'I want better endurance',
  mental_health: 'I want to improve my mental wellbeing',
  daily_energy:  'I want to boost my daily energy levels',
}

function buildSystemPrompt(profile, dayTitle) {
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

    if (profile.beginner_mode) {
      lines.push('')
      lines.push('## Beginner mode')
      lines.push('The user is new to the gym and new to working out. Adjust all guidance accordingly:')
      lines.push('- Recommend conservative starting weights — err on the side of lighter')
      lines.push('- Keep instructions especially clear, step-by-step, and safety-focused')
      lines.push('- Call out common beginner mistakes to avoid')
      lines.push('- When swapping exercises, prefer simpler movements or machine-based alternatives over free weights')
    }
  }

  if (dayTitle) {
    lines.push('')
    lines.push('## Today\'s workout')
    lines.push(`This is a "${dayTitle}". Use this to confirm that the exercise fits the intended muscle group focus for the day.`)
  }

  lines.push('')
  lines.push('Use the profile and goals to personalise starting weight and set recommendations where relevant.')
  lines.push('Always use the search_youtube tool to find the best instructional video for the exercise before responding.')
  lines.push('')
  lines.push('## Content guidelines')
  lines.push('- Exercise name: keep it short and common (e.g. "Squat", "Dumbbell Row") — avoid long anatomical or branded names.')
  lines.push('- Description: be concise. Use short sentences, each on its own line. Beginner-friendly. State what muscles it works and why it matters.')
  lines.push('- Instructions: start with any setup steps (adjust seat, set weight, grip width, foot position, etc.), then describe the movement step by step. Write for someone doing this exercise for the first time.')
  lines.push('- Category: classify the exercise as one of: free_weight (dumbbells, barbells, kettlebells — requires external weight), body_weight (exercises using only your own bodyweight as resistance: push-ups, pull-ups, dips, plank, dead bug, lunges, bodyweight squat, etc.), machine (strength machines only — cable machines, seated resistance machines, smith machine; never cardio equipment), warm_up (cardio equipment like treadmill, rowing machine, bike, elliptical; also dynamic activation and mobility work at the start of a session), stretch (static or dynamic flexibility work).')
  lines.push('- Weight vs duration: set weight (kg) and duration null for weighted exercises. Set duration (seconds) and weight null for timed exercises. Duration is REQUIRED (never null) for warm_up and stretch exercises — cardio warm-ups are typically 300–600s (5–10 min), stretches are typically 30–60s per side.')
  lines.push('- Sets: must be null for every warm_up and stretch exercise, and for any exercise where duration is set. Only provide sets for weighted free_weight or machine exercises.')
  lines.push('')
  lines.push('## Output examples')
  lines.push('')
  lines.push('Weighted exercise — Barbell Row:')
  lines.push('{ "description": "A compound pulling movement that builds thickness across the entire back and engages the biceps as a secondary mover.", "bullets": ["Hinge at the hips until torso is near parallel to the floor", "Pull the bar to your lower chest, driving elbows back", "Lower under control — do not let the bar drop"], "weight": 60, "duration": null, "sets": 4, "video_id": "G8l_8chR5BE", "category": "free_weight" }')
  lines.push('')
  lines.push('Timed exercise — Hip Flexor Stretch:')
  lines.push('{ "description": "A static stretch that opens the hip flexors and relieves tightness after heavy squatting or prolonged sitting.", "bullets": ["Kneel on one knee with the other foot forward", "Drive your hips forward until you feel a deep stretch in the front hip", "Keep your torso upright and hold each side for the full duration"], "weight": null, "duration": 45, "sets": null, "video_id": "YQmpO5rFoFY", "category": "stretch" }')

  return lines.join('\n')
}

// ── Plan generation (Stages 1-3) ──────────────────────────────────────────────

function buildPlanningSystemPrompt(profile, settings) {
  const lines = [
    'You are an expert fitness coach designing a personalized weekly workout plan.',
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
      lines.push('## Goals')
      for (const id of goals) {
        const label = GOAL_LABELS[id]
        if (label) lines.push(`* ${label}`)
      }
    }

    if (profile.beginner_mode || settings.beginnerMode) {
      lines.push('')
      lines.push('## Experience level: Beginner')
      lines.push('The user is new to the gym. Favour compound movements, full-body or upper/lower splits, and simpler progressions. Avoid exercises that require significant technique (e.g. Olympic lifts).')
    } else {
      lines.push('')
      lines.push('## Experience level: Intermediate / Advanced')
    }
  }

  lines.push('')
  lines.push('## Plan requirements')
  lines.push(`- Workout days per week: ${settings.daysPerWeek}`)
  lines.push(`- One of the workout days must be: ${settings.startDay}`)
  lines.push(`- Warm-up: ${settings.includeWarmUp ? 'yes — begin each day with one cardio or mobility warm-up exercise' : 'no'}`)
  lines.push(`- Stretch: ${settings.includeStretch ? 'yes — end each day with 2–3 stretch exercises targeting the muscles worked that day' : 'no'}`)
  lines.push('- Main exercises per day: 6–8 for beginners, 8–10 for intermediate/advanced (not counting warm-up or stretches)')
  lines.push('- Day titles must describe muscle groups plainly: "Chest and Triceps", "Back and Biceps", "Legs", "Full Body", "Upper Body", "Shoulders and Arms" — never gym jargon like "Push Day" or "Pull Day"')

  return lines.join('\n')
}

const PLAN_DAYS_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day:   { type: 'string', enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] },
          title: { type: 'string' },
        },
        required: ['day', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['days'],
  additionalProperties: false,
}

const PLAN_EXERCISES_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day:       { type: 'string' },
          title:     { type: 'string' },
          exercises: { type: 'array', items: { type: 'string' } },
        },
        required: ['day', 'title', 'exercises'],
        additionalProperties: false,
      },
    },
  },
  required: ['days'],
  additionalProperties: false,
}

async function generatePlanStructure(profile, settings, onLog) {
  const system = buildPlanningSystemPrompt(profile, settings)

  // ── Stage 1: Free reasoning ───────────────────────────────────────────────
  const stage1Messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Think carefully about this user's situation before committing to anything. Consider:

- **Day spacing (most important):** The week is a cycle of 7 days — Sunday wraps back to Monday. Spread the ${settings.daysPerWeek} workout days as evenly as possible across all 7. Minimise consecutive workout days — avoid them entirely if the count allows it (1–4 days/week), and keep them to a minimum if unavoidable (5 days/week). Show your work: list all 7 days, mark each W (workout) or R (rest), and verify the gaps look balanced.
- One workout day must fall on ${settings.startDay}.
- What muscle group split makes most sense given their goals, experience level, and number of days per week?
- How should muscle groups be balanced across the week to allow proper recovery?
- Does their goal suggest any particular emphasis (e.g. "get stronger" → compound-heavy; "lose weight" → more volume, possibly cardio warm-ups)?
- How does beginner vs intermediate status affect the split and exercise selection?`,
    },
  ]

  const r1 = await callOpenAI({ model: PLAN_MODEL, messages: stage1Messages })
  const reasoning = r1.choices[0].message.content
  if (onLog) onLog('plan_reasoning', reasoning)

  // ── Stage 2: Commit to day structure ─────────────────────────────────────
  const stage2Messages = [
    ...stage1Messages,
    { role: 'assistant', content: reasoning },
    {
      role: 'user',
      content: `Based on your reasoning, commit to the exact workout days and their titles. Rules:
- Exactly ${settings.daysPerWeek} days total
- ${settings.startDay} must be one of them
- Minimise consecutive workout days — avoid them entirely if the day count allows it (1–3 days/week), keep them to a minimum if unavoidable (4–5 days/week). The week is cyclic — Sunday and Monday are adjacent
- Titles describe muscle groups plainly — no jargon

## Examples

### 3 days/week, start: Monday, intermediate, goal: get stronger
{ "days": [
  { "day": "Monday", "title": "Chest and Triceps" },
  { "day": "Wednesday", "title": "Back and Biceps" },
  { "day": "Friday", "title": "Legs and Shoulders" }
]}

### 4 days/week, start: Saturday, beginner, goal: stay healthy
{ "days": [
  { "day": "Monday", "title": "Full Body" },
  { "day": "Wednesday", "title": "Upper Body" },
  { "day": "Saturday", "title": "Lower Body" },
  { "day": "Thursday", "title": "Full Body" }
]}`,
    },
  ]

  const r2 = await callOpenAI({
    model: PLAN_MODEL,
    messages: stage2Messages,
    response_format: { type: 'json_schema', json_schema: { name: 'plan_days', strict: true, schema: PLAN_DAYS_SCHEMA } },
  })
  const structureText = r2.choices[0].message.content

  // ── Stage 3: Expand each day to exercise names ────────────────────────────
  const stage3Messages = [
    ...stage2Messages,
    { role: 'assistant', content: structureText },
    {
      role: 'user',
      content: `Now expand each day with the specific exercise names in order.
${settings.includeWarmUp ? '- First exercise each day: one cardio or mobility warm-up (e.g. "Treadmill Jog", "Rowing Machine", "Jumping Jacks")' : ''}
- Main exercises targeting that day's muscle groups
${settings.includeStretch ? '- Last 2–3 exercises each day: stretches for the muscles worked (e.g. "Hip Flexor Stretch", "Lat Stretch", "Quad Stretch")' : ''}
- Use common, recognisable names ("Bench Press", "Squat", "Lat Pulldown")
- Do not repeat the same exercise across different days

## Examples

### Back and Biceps (intermediate, warm-up, stretch)
["Rowing Machine", "Barbell Row", "Lat Pulldown", "Seated Cable Row", "Face Pull", "Hammer Curl", "Bicep Curl", "Lat Stretch", "Bicep Stretch"]

### Full Body (beginner, warm-up, stretch)
["Treadmill Jog", "Goblet Squat", "Dumbbell Bench Press", "Dumbbell Row", "Shoulder Press", "Romanian Deadlift", "Plank", "Hip Flexor Stretch", "Hamstring Stretch"]`,
    },
  ]

  const r3 = await callOpenAI({
    model: PLAN_MODEL,
    messages: stage3Messages,
    response_format: { type: 'json_schema', json_schema: { name: 'plan_exercises', strict: true, schema: PLAN_EXERCISES_SCHEMA } },
  })

  return JSON.parse(r3.choices[0].message.content)
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
      maxItems: 5,
      description: 'Three short, imperative-form coaching cues for correct form.',
    },
    weight: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'Starting weight in kg. Set to null for timed exercises (use duration instead).',
    },
    duration: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Duration in seconds for timed exercises (warm-up, stretch, plank, etc.). Set to null for weighted exercises.',
    },
    sets: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Number of working sets. Must be null for any warm_up or stretch category exercise, and for any exercise that uses duration instead of weight. Only provide a value for weighted free_weight or machine exercises.',
    },
    video_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'YouTube video ID of the best instructional video found via search_youtube.',
    },
    category: {
      type: 'string',
      enum: ['free_weight', 'body_weight', 'machine', 'warm_up', 'stretch'],
      description: 'Exercise category. free_weight: requires external weight (dumbbells, barbells, kettlebells). body_weight: uses only your own bodyweight (push-up, pull-up, plank, dead bug, lunge, dip, etc.). machine: strength machines only (cable, seated resistance, smith) — never cardio equipment. warm_up: cardio equipment (treadmill, rowing machine, bike, elliptical) and mobility work at the start of a session. stretch: flexibility work.',
    },
  },
  required: ['description', 'bullets', 'weight', 'duration', 'sets', 'video_id', 'category'],
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
      maxItems: 5,
      description: 'Three short, imperative-form coaching cues for correct form.',
    },
    weight: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'Starting weight in kg. Set to null for timed exercises (use duration instead).',
    },
    duration: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Duration in seconds for timed exercises (warm-up, stretch, plank, etc.). Set to null for weighted exercises.',
    },
    sets: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Number of working sets. Must be null for any warm_up or stretch category exercise, and for any exercise that uses duration instead of weight. Only provide a value for weighted free_weight or machine exercises.',
    },
    video_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'YouTube video ID of the best instructional video found via search_youtube.',
    },
    category: {
      type: 'string',
      enum: ['free_weight', 'body_weight', 'machine', 'warm_up', 'stretch'],
      description: 'Exercise category. free_weight: requires external weight (dumbbells, barbells, kettlebells). body_weight: uses only your own bodyweight (push-up, pull-up, plank, dead bug, lunge, dip, etc.). machine: strength machines only (cable, seated resistance, smith) — never cardio equipment. warm_up: cardio equipment (treadmill, rowing machine, bike, elliptical) and mobility work at the start of a session. stretch: flexibility work.',
    },
  },
  required: ['name', 'description', 'bullets', 'weight', 'duration', 'sets', 'video_id', 'category'],
  additionalProperties: false,
}

// ── Public functions ──────────────────────────────────────────────────────────

async function generateExerciseData(title, profile, dayTitle) {
  return runWithTools(
    [
      { role: 'system', content: buildSystemPrompt(profile, dayTitle) },
      { role: 'user', content: `Exercise: ${title}` },
    ],
    EXERCISE_SCHEMA,
    'exercise_data',
  )
}

async function generateSwapExercise(exercise, reason, otherText, profile, dayTitle) {
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
      { role: 'system', content: buildSystemPrompt(profile, dayTitle) },
      { role: 'user', content: userMessage },
    ],
    SWAP_SCHEMA,
    'swap_exercise_data',
  )
}

module.exports = { generateExerciseData, generateSwapExercise, generatePlanStructure }
