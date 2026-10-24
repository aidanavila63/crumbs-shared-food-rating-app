// #19 AI menu reading: a menu photo read by AI instead of the phone's free text reader — much
// better with columns, fancy fonts and prices. Admin-only (switch "menu_ai") while the free AI
// credit lasts; later a paid feature. Counted against the "menu_photo_ai" budget like every other
// cost (Admin → Spending guard). The photo is sent to the AI once and not stored.
import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { allowanceMessage, takeAllowance } from '@/lib/allowance'
import { parseImage } from '@/lib/menu-photo'

export const maxDuration = 30

const schema = z.object({
  dishes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        price: z.number().nullable(),
        course: z.enum(['starter', 'main', 'side', 'dessert', 'drink']).nullable(),
      }),
    )
    .max(80),
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
  // Switch "menu_ai": a switch nobody added yet means admins only (unlike older switches).
  const [{ data: flag }, { data: me }] = await Promise.all([
    supabase.from('feature_flags').select('state').eq('key', 'menu_ai').maybeSingle(),
    supabase.from('profiles').select('is_admin').eq('id', data.user.id).maybeSingle(),
  ])
  const state = flag?.state ?? 'admin'
  if (state === 'off' || (state === 'admin' && !me?.is_admin))
    return Response.json({ error: 'AI menu reading isn’t available yet' }, { status: 403 })
  const allowance = await takeAllowance(supabase, 'menu_photo_ai')
  if (!allowance.ok)
    return Response.json(
      { error: allowanceMessage(allowance, 'AI menu readings') },
      { status: 429 },
    )

  const { image, placeName } = await request.json().catch(() => ({}))
  const parsed = parseImage(image)
  if (!parsed)
    return Response.json({ error: 'That photo is too big or not an image' }, { status: 400 })
  try {
    const result = await generateObject({
      model: 'openai/gpt-4o-mini',
      schema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `This is a photo of a menu${typeof placeName === 'string' ? ` from "${placeName.slice(0, 120)}"` : ''}.`,
                'List every dish you can read on it, with the name exactly as written.',
                'Price: the number shown for that dish (main size if there are several), else null.',
                'Description: the short text under or next to the dish, else an empty string.',
                'Course: starter, main, side, dessert or drink if the menu section makes it clear, else null.',
                'Never invent dishes or prices that are not visible. If it is not a menu, return an empty list.',
              ].join('\n'),
            },
            { type: 'image', image: parsed.base64, mediaType: parsed.mediaType },
          ],
        },
      ],
    })
    const dishes = result.object.dishes
      .filter((d) => d.name.trim())
      .map((d) => ({
        name: d.name.trim().slice(0, 120),
        price:
          d.price !== null && d.price > 0 && d.price < 10000
            ? Math.round(d.price * 100) / 100
            : null,
        description: d.description.trim().slice(0, 300) || null,
        course: d.course,
      }))
    return Response.json({ dishes })
  } catch (error: any) {
    return Response.json(
      { error: error?.message ? 'AI reading failed — try again' : 'AI reading failed' },
      { status: 502 },
    )
  }
}
