import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { isMapsHost, parseMapsUrl } from '@/lib/maps-link'
import { gate } from '@/lib/server-gate'
import { keepErrors } from '@/lib/server-errors'

// Follows a pasted Google Maps link (including maps.app.goo.gl short links) and returns the
// restaurant name and rough position. Only Google Maps hosts are ever fetched.
async function handlePOST(request: Request) {
  const supabase = await createClient()
  // E17 (Round 86): signed in + let in (+ switch) in one go
  const pass = await gate(supabase)
  if ('response' in pass) return pass.response
  const data = { user: { id: pass.userId } }
  if (tooManyRequests(`maps-link:${data.user.id}`, 20))
    return Response.json({ error: 'Too many imports, wait a moment' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  let current = String(body.url ?? '')
    .trim()
    .slice(0, 600)
  try {
    for (let hop = 0; hop < 5; hop += 1) {
      const url = new URL(current)
      if (url.protocol !== 'https:' || !isMapsHost(url.hostname, url.pathname))
        return Response.json({ error: 'That isn’t a map link Crumbs can read' }, { status: 400 })
      const parsed = parseMapsUrl(url.toString())
      if (parsed) return Response.json(parsed)
      const response = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; Crumbs/1.0)' },
        signal: AbortSignal.timeout(6000),
      })
      const next = response.headers.get('location')
      if (!next) break
      current = new URL(next, url).toString()
    }
  } catch {
    return Response.json({ error: 'Could not open that link' }, { status: 400 })
  }
  return Response.json({ error: "Couldn't find a restaurant in that link" }, { status: 422 })
}

// Third pass #9: unexpected failures go into Admin → Errors (Vercel keeps logs an hour).
export const POST = keepErrors('POST /api/maps-link', handlePOST)
