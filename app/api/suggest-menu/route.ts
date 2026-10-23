import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { readMenuText } from '@/lib/menu-fetch'

export const maxDuration = 30

const schema = z.object({
  dishes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        price: z.number().nullable(),
      }),
    )
    .max(25),
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

  const { placeId } = await request.json()
  if (!placeId || typeof placeId !== 'string') {
    return Response.json({ error: 'Place is required' }, { status: 400 })
  }
  // Read the website from the database (row-level security limits this to your own groups).
  const { data: place } = await supabase
    .from('places')
    .select('name,website')
    .eq('id', placeId)
    .maybeSingle()
  if (!place) return Response.json({ error: 'Place not found' }, { status: 404 })
  if (!place.website) return Response.json({ dishes: [], reason: 'no-website' })

  try {
    const text = await readMenuText(place.website)
    if (text.length < 200) return Response.json({ dishes: [], reason: 'unreadable' })
    const result = await generateObject({
      model: 'openai/gpt-4o-mini',
      schema,
      prompt: [
        `Below is text copied from the website of the restaurant "${place.name}".`,
        'List dishes that are explicitly named in this text. Use the exact dish name as written.',
        'Only include what the text says. Never add dishes from memory or guess. Copy a price only if it is shown next to the dish, otherwise use null. Description should come from the text, or be an empty string.',
        'Ignore drinks, hours, and navigation text. If the text is not a menu, return an empty list.',
        '',
        text,
      ].join('\n'),
    })
    return Response.json({
      dishes: result.object.dishes.filter((dish) => dish.name.trim()),
      reason: result.object.dishes.length ? 'ok' : 'no-menu',
    })
  } catch (error: any) {
    return Response.json({ error: error?.message || 'AI request failed' }, { status: 502 })
  }
}
