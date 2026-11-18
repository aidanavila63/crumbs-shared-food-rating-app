import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { fetchPage, RobotsBlockedError } from '@/lib/menu-fetch'
import { cleanWebsite } from '@/lib/osm'
import { allowanceMessage, takeAllowance } from '@/lib/allowance'
import { readRecipe } from '@/lib/recipe-tools'
import { gate } from '@/lib/server-gate'
import { keepErrors } from '@/lib/server-errors'

// U9 (Round 88): "Add from a link" — reads the recipe a page publishes about itself (schema.org
// Recipe data, the same thing search engines read). No AI. Uses the daily "website" allowance,
// respects robots.txt and only fetches public addresses (fetchPage).
export const maxDuration = 20

async function handlePOST(request: Request) {
  const supabase = await createClient()
  const pass = await gate(supabase)
  if ('response' in pass) return pass.response
  const body = await request.json().catch(() => ({}))
  const url = cleanWebsite(typeof body.url === 'string' ? body.url : null)
  if (!url) return Response.json({ error: 'That doesn’t look like a web link' }, { status: 400 })
  if (tooManyRequests(`recipe-import:${pass.userId}`, 20))
    return Response.json({ error: 'Too many in a row — wait a moment' }, { status: 429 })
  const allowance = await takeAllowance(supabase, 'website')
  if (!allowance.ok)
    return Response.json({ error: allowanceMessage(allowance, 'website reads') }, { status: 429 })
  try {
    const page = await fetchPage(url)
    const recipe = page ? readRecipe(page.html) : null
    if (!recipe)
      return Response.json(
        {
          error: 'Couldn’t find a recipe on that page — you can still save the link and type it in',
        },
        { status: 422 },
      )
    return Response.json({ recipe, url: page!.url })
  } catch (error) {
    if (error instanceof RobotsBlockedError)
      return Response.json(
        { error: 'That site asks apps not to read it — save the link instead' },
        { status: 422 },
      )
    return Response.json({ error: 'Couldn’t open that page' }, { status: 502 })
  }
}

export const POST = keepErrors('POST /api/recipe-import', handlePOST)
