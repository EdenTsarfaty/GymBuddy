const { countTokens } = require('./tokenizer')

const OPENAI_MODEL = 'gpt-5.4-nano'
const PLAN_MODEL = 'gpt-5.4-mini'

// gpt-5.4-mini: 400k context window, 128k max output. We cap our own output well
// below that (a coaching reply is never more than a few hundred tokens) so the
// budget is predictable and a runaway generation can't eat the whole window.
const CHAT_CONTEXT_WINDOW = 400000
const CHAT_MAX_COMPLETION_TOKENS = 2000
const CHAT_SAFETY_MARGIN = 1000

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
  lines.push('Always use the search_youtube tool to find the best instructional video for the exercise before responding. All results are short clips (under a minute) — prefer the one that most clearly demonstrates full, correct form despite the brevity.')
  lines.push('')
  lines.push('## Content guidelines')
  lines.push('- Exercise name: keep it short and common (e.g. "Squat", "Dumbbell Row") — avoid long anatomical or branded names.')
  lines.push('- Description: be concise. Use short sentences, each on its own line. Beginner-friendly. State what muscles it works and why it matters.')
  lines.push('- Instructions: start with any setup steps (adjust seat, set weight, grip width, foot position, etc.), then describe the movement step by step. Write for someone doing this exercise for the first time. Provide 4–7 bullets, thorough enough to actually teach the exercise. For cable or machine exercises with a choice of handle or attachment (straight bar, EZ bar, V-bar, rope, wide-grip bar, single handle, etc.), state which one to use and briefly why. For any exercise that has sets, include one bullet giving the recommended rest time between sets (typically 60–90s for most work, 2–3 min for heavy compound lifts).')
  lines.push('- Category: classify the exercise as one of: free_weight (dumbbells, barbells, kettlebells — requires external weight), body_weight (exercises using only your own bodyweight as resistance: push-ups, pull-ups, dips, plank, dead bug, lunges, bodyweight squat, etc.), machine (strength machines only — cable machines, seated resistance machines, smith machine; never cardio equipment), warm_up (cardio equipment like treadmill, rowing machine, bike, elliptical; also dynamic activation and mobility work at the start of a session), stretch (static or dynamic flexibility work).')
  lines.push('- Weight vs duration: set weight (kg) and duration null for weighted exercises. Set duration (seconds) and weight null for timed exercises. Duration is REQUIRED (never null) for warm_up and stretch exercises — cardio warm-ups are typically 300–600s (5–10 min), stretches are typically 30–60s per side.')
  lines.push('- Per-hand weight: for any exercise performed with a separate weight in each hand (dumbbells, single-arm cables, kettlebells held one per side, etc.), weight is the load held in ONE hand, not the combined total across both.')
  lines.push('- Sets: must be null for every warm_up and stretch exercise, and for any exercise where duration is set. Only provide sets for weighted free_weight or machine exercises.')
  lines.push('- Reps: required whenever sets is provided (a realistic rep count for the exercise and rep range, typically 6–15). Must be null whenever sets is null.')
  lines.push('')
  lines.push('## Output examples')
  lines.push('')
  lines.push('Weighted exercise — Barbell Row:')
  lines.push('{ "description": "A compound pulling movement that builds thickness across the entire back and engages the biceps as a secondary mover.", "bullets": ["Set up with a loaded barbell on the floor, feet hip-width apart", "Hinge at the hips until your torso is near parallel to the floor", "Grip the bar just outside your knees with an overhand grip", "Pull the bar to your lower chest, driving elbows back and squeezing your shoulder blades", "Lower under control — do not let the bar drop", "Rest 90–120 seconds between sets"], "weight": 60, "duration": null, "sets": 4, "reps": 8, "video_id": "G8l_8chR5BE", "category": "free_weight" }')
  lines.push('')
  lines.push('Cable/machine exercise with an attachment choice — Cable Tricep Pushdown:')
  lines.push('{ "description": "An isolation movement for the triceps using a cable stack, offering controlled, joint-friendly volume.", "bullets": ["Use a rope attachment for a deeper stretch and stronger triceps contraction, or a straight bar for a more controlled, less wrist-intensive path", "Set the cable pulley to the top position and grip the attachment", "Keep your elbows pinned to your sides throughout the movement", "Extend your arms fully, squeezing the triceps at the bottom without flaring your elbows", "Control the return to the top — do not let the weight stack slam", "Rest 60–90 seconds between sets"], "weight": 20, "duration": null, "sets": 3, "reps": 12, "video_id": "SzoOSg-Nv7M", "category": "machine" }')
  lines.push('')
  lines.push('Timed exercise — Hip Flexor Stretch:')
  lines.push('{ "description": "A static stretch that opens the hip flexors and relieves tightness after heavy squatting or prolonged sitting.", "bullets": ["Kneel on one knee with the other foot forward, front knee stacked over the ankle", "Keep your torso upright and core braced", "Drive your hips forward until you feel a deep stretch in the front of the hip", "Breathe slowly and avoid bouncing — hold the stretch steady", "Hold for the full duration, then switch sides"], "weight": null, "duration": 45, "sets": null, "reps": null, "video_id": "YQmpO5rFoFY", "category": "stretch" }')

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
      lines.push('Give a slight preference to machine-based exercises over free-weight equivalents where a reasonable machine alternative exists — machines guide the movement path, leaving less room for form errors and injury. This is a mild preference, not a hard rule: still include free-weight and body-weight staples where they fit best.')
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
${settings.includeWarmUp ? '- The warm-up MUST be the very first exercise in the list, position 1, before any main exercise — one cardio or mobility warm-up (e.g. "Treadmill Jog", "Rowing Machine", "Jumping Jacks")' : ''}
- Main exercises targeting that day's muscle groups
${settings.includeStretch ? '- The stretches MUST be the very last exercises in the list, after every main exercise, never interleaved among them — 2–3 stretches for the muscles worked (e.g. "Hip Flexor Stretch", "Lat Stretch", "Quad Stretch")' : ''}
- Use common, recognisable names ("Bench Press", "Squat", "Lat Pulldown")
- Do not repeat the same exercise across different days
- Order matters: a muscle needs a breather before it's worked again within the same session, so don't stack consecutive exercises for the same muscle back to back — space them out with exercises for a different muscle in between. On a day focused on one major muscle group (e.g. a dedicated Legs day), apply the same idea one level down, at the sub-muscle level (quads, hamstrings, calves, glutes), so consecutive exercises don't repeatedly hit the same sub-muscle.

## Examples

### Back and Biceps (intermediate, warm-up, stretch)
["Rowing Machine", "Barbell Row", "Lat Pulldown", "Seated Cable Row", "Face Pull", "Hammer Curl", "Bicep Curl", "Lat Stretch", "Bicep Stretch"]

### Full Body (beginner, warm-up, stretch)
["Treadmill Jog", "Goblet Squat", "Dumbbell Bench Press", "Dumbbell Row", "Shoulder Press", "Romanian Deadlift", "Plank", "Hip Flexor Stretch", "Hamstring Stretch"]

### Legs (intermediate, warm-up, stretch) — sub-muscles alternated
["Treadmill Jog", "Squat", "Hamstring Curl", "Leg Press", "Romanian Deadlift", "Calf Raise", "Walking Lunge", "Quad Stretch", "Hamstring Stretch"]`,
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

function parseDurationSeconds(iso) {
  if (!iso) return null
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  const h = parseInt(m[1] || '0', 10)
  const min = parseInt(m[2] || '0', 10)
  const s = parseInt(m[3] || '0', 10)
  return h * 3600 + min * 60 + s
}

const MAX_VIDEO_SECONDS = 60

async function searchYouTube(query) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []

  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: 15,
    order: 'relevance',
    videoDuration: 'short', // YouTube's own bucket: <4 min — narrows the pool before our stricter cutoff below
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
      seconds: parseDurationSeconds(item.contentDetails?.duration || ''),
    }
  }

  return items
    .map((item) => {
      const videoId = item.id.videoId
      const stats = statsMap[videoId] || {}
      return {
        video_id: videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        description: (item.snippet.description || '').slice(0, 150),
        views: stats.views || 0,
        duration: stats.duration || '',
        seconds: stats.seconds,
      }
    })
    // Hard rule: never show the model a video 1 minute or longer.
    .filter((r) => r.seconds != null && r.seconds < MAX_VIDEO_SECONDS)
}

function formatYouTubeResults(results) {
  if (!results || results.length === 0) return 'No results found.'
  return results
    .map((r, i) =>
      `${i + 1}. "${r.title}" | Channel: ${r.channel} | Views: ${r.views.toLocaleString()} | Duration: ${r.duration} | ID: ${r.video_id}\n   ${r.description}`,
    )
    .join('\n\n')
}

// ── Chat proposal tools ────────────────────────────────────────────────────────

const PROPOSE_STAT_CHANGE_TOOL = {
  type: 'function',
  function: {
    name: 'propose_stat_change',
    description: 'Propose new sets/reps/weight/duration values for this exercise. Provide the full target state, not just the fields that change — weight+sets+reps and duration are mutually exclusive, exactly one group must be non-null, matching whichever this exercise already uses.',
    parameters: {
      type: 'object',
      properties: {
        sets: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Target number of working sets, or null for a timed exercise.' },
        reps: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Target reps per set, or null for a timed exercise.' },
        weight: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Target weight in kg, or null for a timed exercise.' },
        duration: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Target duration in seconds, or null for a weighted/rep-based exercise.' },
      },
      required: ['sets', 'reps', 'weight', 'duration'],
      additionalProperties: false,
    },
    strict: true,
  },
}

const PROPOSE_SWAP_TOOL = {
  type: 'function',
  function: {
    name: 'propose_swap_exercise',
    description: 'Propose replacing this exercise entirely with a different one better suited to the user, e.g. because it hurts, is unavailable, or they want something new.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', enum: ['hurts', 'new', 'unavailable', 'other'], description: 'Why the exercise should be swapped.' },
        other_text: { type: 'string', description: 'Free-text explanation when reason is "other" (or extra context for any reason). Empty string if not needed.' },
      },
      required: ['reason', 'other_text'],
      additionalProperties: false,
    },
    strict: true,
  },
}

const PROPOSE_VIDEO_CHANGE_TOOL = {
  type: 'function',
  function: {
    name: 'propose_video_change',
    description: 'Propose swapping this exercise\'s demonstration video for a different one, e.g. because the current video is unclear or does not match the user\'s question.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short reason a different video would help.' },
      },
      required: ['reason'],
      additionalProperties: false,
    },
    strict: true,
  },
}

const CHAT_TOOLS = [PROPOSE_STAT_CHANGE_TOOL, PROPOSE_SWAP_TOOL, PROPOSE_VIDEO_CHANGE_TOOL]
const CHAT_TOOLS_TOKENS = countTokens(JSON.stringify(CHAT_TOOLS))
const MAX_CHAT_TOOL_ROUNDS = 4

const PROPOSAL_TYPE_BY_TOOL = {
  propose_stat_change: 'stat_change',
  propose_swap_exercise: 'swap',
  propose_video_change: 'video_change',
}

async function runChatWithTools(messages) {
  const proposals = []

  for (let round = 0; round < MAX_CHAT_TOOL_ROUNDS; round++) {
    const data = await callOpenAI({
      model: PLAN_MODEL,
      messages,
      tools: CHAT_TOOLS,
      tool_choice: 'auto',
      max_completion_tokens: CHAT_MAX_COMPLETION_TOKENS,
    })

    const choice = data.choices[0]
    messages.push(choice.message)

    if (choice.finish_reason !== 'tool_calls') {
      return { text: choice.message.content, proposals }
    }

    for (const toolCall of choice.message.tool_calls) {
      proposals.push({
        id: crypto.randomUUID(),
        type: PROPOSAL_TYPE_BY_TOOL[toolCall.function.name],
        payload: JSON.parse(toolCall.function.arguments),
      })
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'ok' })
    }
  }

  return { text: messages[messages.length - 1]?.content || '', proposals }
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
    const err = new Error(`OpenAI request failed (${res.status}): ${text}`)
    err.status = res.status
    err.body = text
    throw err
  }
  return res.json()
}

function describeOpenAIError(err) {
  if (err?.status === 401) return 'Invalid or missing OpenAI API key'
  if (err?.status === 429) {
    if (err.body?.includes('insufficient_quota')) return 'OpenAI quota exceeded — check billing at platform.openai.com'
    return 'OpenAI rate limited — too many requests'
  }
  if (err?.status >= 500) return `OpenAI server error (${err.status}) — try again later`
  if (err?.name === 'TypeError') return 'Could not reach OpenAI — network error'
  return `OpenAI error: ${err?.message || err}`
}

async function checkOpenAIHealth() {
  try {
    await callOpenAI({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_completion_tokens: 16,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, message: describeOpenAIError(err) }
  }
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
      minItems: 4,
      maxItems: 7,
      description: 'Short, imperative-form coaching cues covering setup and execution. When the exercise offers a choice of handle/attachment (cable or machine exercises), one bullet must state which to use and why. When the exercise has sets, one bullet must state the recommended rest time between sets.',
    },
    weight: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Starting weight in kg as a whole number (no decimals). Set to null for timed exercises (use duration instead).',
    },
    duration: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Duration in seconds for timed exercises (warm-up, stretch, plank, etc.). Set to null for weighted exercises.',
    },
    sets: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Number of working sets. Must be null for any warm_up or stretch category exercise, and for any exercise that uses duration instead of weight. Only provide a value for weighted free_weight or machine exercises.',
    },
    reps: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Number of reps per set, typically 6-15. Required whenever sets is provided; must be null whenever sets is null.',
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
  required: ['description', 'bullets', 'weight', 'duration', 'sets', 'reps', 'video_id', 'category'],
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
      minItems: 4,
      maxItems: 7,
      description: 'Short, imperative-form coaching cues covering setup and execution. When the exercise offers a choice of handle/attachment (cable or machine exercises), one bullet must state which to use and why. When the exercise has sets, one bullet must state the recommended rest time between sets.',
    },
    weight: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Starting weight in kg as a whole number (no decimals). Set to null for timed exercises (use duration instead).',
    },
    duration: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Duration in seconds for timed exercises (warm-up, stretch, plank, etc.). Set to null for weighted exercises.',
    },
    sets: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Number of working sets. Must be null for any warm_up or stretch category exercise, and for any exercise that uses duration instead of weight. Only provide a value for weighted free_weight or machine exercises.',
    },
    reps: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Number of reps per set, typically 6-15. Required whenever sets is provided; must be null whenever sets is null.',
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
  required: ['name', 'description', 'bullets', 'weight', 'duration', 'sets', 'reps', 'video_id', 'category'],
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
    dislike:     "I don't like this exercise",
    other:       otherText || 'Other',
  }

  const reasonText = REASON_LABELS[reason] || REASON_LABELS.other
  // otherText already IS the reason text when reason === 'other' — only append
  // it separately when it's supplementary detail alongside a different reason.
  const detailsNote = reason !== 'other' && otherText ? ` Additional details: ${otherText}` : ''
  const userMessage = [
    `Exercise: ${exercise.name}`,
    `Description: ${exercise.description}`,
    `Instructions: ${exercise.bullets.join(' | ')}`,
    '',
    `The user has asked to replace this exercise for the reason: ${reasonText}.${detailsNote} Find a replacement exercise addressing his concern, while retaining the same muscle groups focus as the original exercise.`,
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

// ── Exercise chat ─────────────────────────────────────────────────────────────

function buildChatSystemPrompt(exercise, profile) {
  const lines = [
    "You are the user's personal training assistant, chatting with them about one specific exercise in their workout plan.",
    '',
    '## Tone',
    '- Professional but friendly and encouraging — like a knowledgeable coach pal, not a textbook.',
    '- Concise by default — keep answers short and to the point, no repeating yourself. If a question genuinely needs a longer answer, give one, using bullets to keep it scannable rather than a wall of text.',
    '- Structured: Make use of bullets or numbered lists whenever necessary',
    '- Light on jargon — explain in plain language, only use technical terms the user already used first.',
    '- Positive attitude, but honest — do not just tell the user what they want to hear.',
    "- If the user reports pain, take it seriously: distinguish normal muscle fatigue from sharp or joint pain, advise stopping if something feels wrong.",
    '- Stay focused on this exercise and the user\'s fitness question. Do not wander into unrelated topics. Reject any non-topic subjects.',
    '',
    '## Proposing changes',
    'You have tools to propose concrete changes to this exercise: propose_stat_change (adjust sets/reps/weight/duration), propose_swap_exercise (replace this exercise entirely), propose_video_change (swap the demonstration video). The user sees each as a button and applies it themselves — you never apply it yourself.',
    '- Only call a tool when the conversation clearly warrants it (e.g. they say it\'s too easy/hard, report pain, ask for heavier/lighter weight, want a different exercise, or the video is unclear). Do not propose changes speculatively or on every message.',
    '- Still give your normal short reply alongside the tool call — that\'s where you explain your reasoning. The button only shows the resulting numbers.',
    '- propose_stat_change always takes the complete new sets/reps/weight/duration state, not just the field that changed.',
    '- Only call more than one tool in the same turn when genuinely proposing distinct kinds of changes at once.',
    '',
    '## This exercise',
    `Name: ${exercise.name}`,
    `Category: ${exercise.category}`,
    `Description: ${exercise.description}`,
  ]

  const bullets = (() => {
    try { return JSON.parse(exercise.bullets) } catch { return [] }
  })()
  if (bullets.length > 0) {
    lines.push('Instructions:')
    for (const b of bullets) lines.push(`- ${b}`)
  }

  if (exercise.sets != null) lines.push(`Sets: ${exercise.sets}`)
  if (exercise.reps != null) lines.push(`Reps: ${exercise.reps}`)
  if (exercise.weight != null) lines.push(`Weight: ${exercise.weight} kg`)
  if (exercise.duration != null) lines.push(`Duration: ${exercise.duration}s`)

  lines.push('')
  lines.push('## User profile')
  if (profile) {
    if (profile.age != null) lines.push(`Age: ${profile.age}`)
    if (profile.height != null) lines.push(`Height: ${profile.height} cm`)
    if (profile.weight != null) lines.push(`Weight: ${profile.weight} kg`)

    const goals = Array.isArray(profile.goals) ? profile.goals : []
    if (goals.length > 0) {
      lines.push('Goals:')
      for (const id of goals) {
        const label = GOAL_LABELS[id]
        if (label) lines.push(`- ${label}`)
      }
    }

    if (profile.beginner_mode) {
      lines.push('The user is new to the gym — keep guidance especially clear and beginner-friendly.')
    }
  } else {
    lines.push('No profile on file.')
  }

  return lines.join('\n')
}

// Keeps only whole messages, newest first, that fit under budget — never cuts a
// message short. The current (most recent) message is always kept even if it
// alone were to exceed budget, since dropping it would leave nothing to reply to.
function trimHistoryToBudget(history, budget) {
  const kept = []
  let used = 0

  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]
    const tokens = message.token_count ?? countTokens(message.text)
    if (kept.length > 0 && used + tokens > budget) break
    kept.push(message)
    used += tokens
  }

  return kept.reverse()
}

async function generateChatReply(exercise, profile, history) {
  const systemPrompt = buildChatSystemPrompt(exercise, profile)
  const reserved = countTokens(systemPrompt) + CHAT_TOOLS_TOKENS + CHAT_MAX_COMPLETION_TOKENS + CHAT_SAFETY_MARGIN
  const historyBudget = Math.max(CHAT_CONTEXT_WINDOW - reserved, 0)
  const trimmedHistory = trimHistoryToBudget(history, historyBudget)

  const messages = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.text })),
  ]

  return runChatWithTools(messages)
}

async function findVideoForExercise(name) {
  const results = await searchYouTube(`${name} exercise form tutorial`)
  return results[0]?.video_id || null
}

// ── Photo-based exercise identification (Edit Plan's "Photo search") ──────────

// `observed_details` comes before `name` in the schema deliberately — with
// strict structured output, the model fills properties in declared order, so
// making it write out what it actually sees (equipment type, angle, grip)
// before committing to a name is a free way to make the final guess better
// grounded, not just a documentation field nobody reads.
const PHOTO_IDENTIFY_SCHEMA = {
  type: 'object',
  properties: {
    observed_details: {
      type: 'string',
      description: 'What in the photo distinguishes this specific exercise/equipment from similar variants of the same base movement — equipment type (machine/cable/dumbbell/barbell/bodyweight), bench or seat angle (flat/incline/decline), grip or handle style, seated vs standing, single-limb vs both. Write this out before deciding on a name.',
    },
    name: {
      type: 'string',
      description: 'The exercise or gym-machine name, informed by observed_details above. Must stay specific enough to distinguish it from other variants of the same base movement — e.g. "Chest Press Machine", not just "Chest Press", if it\'s a machine; "Incline Dumbbell Press", not just "Dumbbell Press", if the bench is inclined. A vague name that drops a real distinguishing qualifier for the sake of brevity is a wrong answer, even if the base movement is right. Keep it to how a gym-goer would casually refer to it otherwise — avoid brand/model names printed on the equipment (a brand isn\'t a meaningful qualifier).',
    },
  },
  required: ['observed_details', 'name'],
  additionalProperties: false,
}

// imageDataUrl is a data: URI (e.g. "data:image/jpeg;base64,...") — the
// caller is responsible for having already re-encoded the upload through a
// real image decoder first (see exercisePhotos.reencodeForAnalysis), the
// same way exercise photo uploads are neutralized before being trusted.
// Uses PLAN_MODEL (not the lighter OPENAI_MODEL used for routine per-
// exercise generation) since a wrong or vague guess here compounds — it
// becomes the title fed into generateExerciseData right after.
async function identifyExerciseFromPhoto(imageDataUrl) {
  const data = await callOpenAI({
    model: PLAN_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You identify gym equipment or exercises from a photo for a fitness tracker app. Look carefully for whatever distinguishes this from similar exercise variants — equipment type, angle, grip, seated vs standing, single vs double limb — since a vague name would be wrong for this purpose even when it names the right general movement. Respond only with the requested fields.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What exercise or gym machine is shown in this photo? Note the distinguishing details first, then give your best-guess name.' },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'exercise_photo_guess', strict: true, schema: PHOTO_IDENTIFY_SCHEMA },
    },
  })
  return JSON.parse(data.choices[0].message.content).name
}

module.exports = { generateExerciseData, generateSwapExercise, generatePlanStructure, generateChatReply, findVideoForExercise, searchYouTube, checkOpenAIHealth, describeOpenAIError, identifyExerciseFromPhoto }
