import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'

const schema = z.object({
  dishes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
      }),
    )
    .max(8),
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

  const { name, address, cuisine, website } = await request.json()
  if (!name || typeof name !== 'string' || name.length > 120) {
    return Response.json({ error: 'Restaurant name is required' }, { status: 400 })
  }
  try {
    const result = await generateObject({
      model: 'openai/gpt-4o-mini',
      schema,
      prompt: [
        `Restaurant: ${name}`,
        address ? `Address: ${String(address).slice(0, 200)}` : null,
        cuisine ? `Cuisine type: ${String(cuisine).slice(0, 60)}` : null,
        website ? `Website: ${String(website).slice(0, 200)}` : null,
        '',
        'You cannot see this restaurant\'s real menu. Only list dishes you are genuinely confident this specific restaurant serves, or classic dishes of its cuisine type when the cuisine is known.',
        'Do not invent signature dishes, specials, or prices. Keep each description to one short, generic sentence.',
        'If you do not recognise the restaurant and the cuisine is unknown, return an empty list.',
      ]
        .filter((line) => line !== null)
        .join('\n'),
    })
    return Response.json(result.object)
  } catch (error: any) {
    return Response.json({ error: error?.message || 'AI request failed' }, { status: 502 })
  }
}
