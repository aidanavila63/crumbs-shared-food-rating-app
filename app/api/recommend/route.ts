import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'

const schema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().describe('A cuisine, dish style, or kind of outing to try next'),
        why: z.string().describe('One sentence tying it to what the couple already likes'),
      }),
    )
    .min(3)
    .max(5),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  if (tooManyRequests(data.user.id))
    return Response.json(
      { error: 'Slow down a little and try again in a few minutes' },
      { status: 429 },
    )

  const { taste } = await request.json()
  if (!taste || typeof taste !== 'string') {
    return Response.json({ error: 'Nothing to base ideas on yet' }, { status: 400 })
  }
  try {
    const result = await generateObject({
      model: 'openai/gpt-4o-mini',
      schema,
      prompt: `A couple shares a food diary. Based on their ratings below, suggest 3-5 cuisines, dishes or kinds of outings they would likely enjoy next. Do NOT name specific restaurants (you cannot verify they exist). Keep each reason to one friendly sentence.\n\n${taste.slice(0, 4000)}`,
    })
    return Response.json(result.object)
  } catch (error: any) {
    return Response.json({ error: error?.message || 'AI request failed' }, { status: 502 })
  }
}
