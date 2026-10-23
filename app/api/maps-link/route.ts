import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { isMapsHost, parseMapsUrl } from '@/lib/maps-link'

// Follows a pasted Google Maps link (including maps.app.goo.gl short links) and returns the
// restaurant name and rough position. Only Google Maps hosts are ever fetched.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
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
        return Response.json({ error: 'That is not a Google Maps link' }, { status: 400 })
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
