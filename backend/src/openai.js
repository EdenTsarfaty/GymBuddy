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

  return lines.join('\n')
}

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
  },
  required: ['description', 'bullets', 'weight', 'sets'],
  additionalProperties: false,
}

async function generateExerciseData(title, profile) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(profile),
        },
        { role: 'user', content: `Exercise: ${title}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'exercise_data',
          strict: true,
          schema: EXERCISE_SCHEMA,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return JSON.parse(data.choices[0].message.content)
}

module.exports = { generateExerciseData }
