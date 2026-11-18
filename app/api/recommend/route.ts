import { generateObject } from 'ai'
import { overDailyLimit } from '@/lib/tier-limits'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { gate } from '@/lib/server-gate'
import { keepErrors } from '@/lib/server-errors'

const schema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().describe('A cuisine, dish style, or kind of outing to try next'),
        why: z.string().describe('One sentence tying it to what they already like'),
      }),
    )
    .min(3)
    .max(5),
})

async function handlePOST(request: Request) {
  const supabase = await createClient()
  // E17 (Round 86): signed in + let in (+ switch) in one go
  const pass = await gate(supabase, { key: 'ai_ideas', off: 'AI ideas are switched off for now' })
  if ('response' in pass) return pass.response
  const data = { user: { id: pass.userId } }
  if (tooManyRequests(data.user.id))
    return Response.json(
      { error: 'Slow down a little and try again in a few minutes' },
      { status: 429 },
    )
  const capped = await overDailyLimit(supabase, data.user.id, 'ai')
  if (capped) return Response.json({ error: capped }, { status: 429 })

  const { taste } = await request.json().catch(() => ({}))
  if (!taste || typeof taste !== 'string') {
    return Response.json({ error: 'Nothing to base ideas on yet' }, { status: 400 })
  }
  try {
    const result = await generateObject({
      model: 'openai/gpt-4o-mini',
      schema,
      prompt: `Someone keeps a food diary, alone or with the people they eat with. Based on the ratings below, suggest 3-5 cuisines, dishes or kinds of outings they would likely enjoy next. Do NOT name specific restaurants (you cannot verify they exist). Keep each reason to one friendly sentence.\n\n${taste.slice(0, 4000)}`,
    })
    return Response.json(result.object)
  } catch (error: any) {
    return Response.json({ error: error?.message || 'AI request failed' }, { status: 502 })
  }
}

// Third pass #9: unexpected failures go into Admin → Errors (Vercel keeps logs an hour).
export const POST = keepErrors('POST /api/recommend', handlePOST)
