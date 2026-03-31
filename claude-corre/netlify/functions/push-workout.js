import Anthropic from '@anthropic-ai/sdk'

// Garmin workout JSON structure for a distance-based easy run with HR target
function buildEasyRunWorkout(name, distanceMeters, hrMin, hrMax) {
  const date = new Date().toISOString().split('T')[0]
  return {
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutName: `${name} [${date}]`,
    estimatedDurationInSecs: Math.round(distanceMeters * 0.42),
    estimatedDistanceInMeters: distanceMeters,
    workoutSegments: [{
      segmentOrder: 1,
      sportType: { sportTypeId: 1, sportTypeKey: 'running' },
      workoutSteps: [
        {
          stepOrder: 1, stepType: { stepTypeId: 1, stepTypeKey: 'warmup' },
          childStepId: null, description: 'Walk warm-up',
          endCondition: { conditionTypeId: 2, conditionTypeKey: 'time' },
          endConditionValue: 240,
          targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' },
          targetValueOne: null, targetValueTwo: null,
        },
        {
          stepOrder: 2, stepType: { stepTypeId: 3, stepTypeKey: 'interval' },
          childStepId: null, description: `Z2 easy run — HR ${hrMin}-${hrMax} bpm`,
          endCondition: { conditionTypeId: 3, conditionTypeKey: 'distance' },
          endConditionValue: distanceMeters,
          targetType: { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart.rate.zone' },
          targetValueOne: hrMin + 100, targetValueTwo: hrMax + 100,
        },
        {
          stepOrder: 3, stepType: { stepTypeId: 2, stepTypeKey: 'cooldown' },
          childStepId: null, description: 'Walk cool-down',
          endCondition: { conditionTypeId: 2, conditionTypeKey: 'time' },
          endConditionValue: 240,
          targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' },
          targetValueOne: null, targetValueTwo: null,
        }
      ]
    }]
  }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    })
  }

  const { prescription } = await req.json()

  // Use Claude to extract workout parameters from the prescription text
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const extract = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Extract workout parameters from this prescription. Respond with JSON only, no explanation:
{"distanceMeters": <number>, "hrMin": <number>, "hrMax": <number>, "name": "<short name>"}

Prescription:
${prescription}`
    }]
  })

  let params
  try {
    const json = extract.content[0].text.match(/\{[\s\S]*\}/)[0]
    params = JSON.parse(json)
  } catch {
    params = { distanceMeters: 4500, hrMin: 130, hrMax: 142, name: 'Z2 Easy Run' }
  }

  const workout = buildEasyRunWorkout(params.name, params.distanceMeters, params.hrMin, params.hrMax)

  // Upload to Garmin Connect using stored tokens
  const oauth1 = JSON.parse(process.env.GARMIN_OAUTH1_TOKEN || '{}')
  const oauth2 = JSON.parse(process.env.GARMIN_OAUTH2_TOKEN || '{}')

  if (!oauth2.access_token) {
    return new Response(JSON.stringify({
      error: 'Garmin tokens not configured. Set GARMIN_OAUTH1_TOKEN and GARMIN_OAUTH2_TOKEN env vars.'
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }

  const garminRes = await fetch('https://connectapi.garmin.com/workout-service/workout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${oauth2.access_token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GCM-iOS-5.7.2.1',
    },
    body: JSON.stringify(workout)
  })

  if (!garminRes.ok) {
    const err = await garminRes.text()
    return new Response(JSON.stringify({ error: `Garmin API error ${garminRes.status}: ${err}` }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await garminRes.json()
  return new Response(JSON.stringify({ workoutId: result.workoutId || result.workout_id }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

export const config = { path: '/api/push-workout' }
