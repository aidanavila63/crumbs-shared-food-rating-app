import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { fetchPage, findMenuLinks } from '@/lib/menu-fetch'
import { readSiteInfo } from '@/lib/site-info'
import { cleanWebsite } from '@/lib/osm'

// Reads a restaurant's own website for hours, phone, cuisine, price and menu link — free,
// and a backup for when Google is down or over budget. Cached for a day per site.
const cache = new Map<string, { at: number; info: unknown }>()
export const maxDuration = 15

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const site = cleanWebsite(new URL(request.url).searchParams.get('url'))
  if (!site) return Response.json({ error: 'Need a website' }, { status: 400 })
  const key = site.replace(/\/+$/, '').toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 864e5) return Response.json({ info: hit.info })
  if (tooManyRequests(`site:${data.user.id}`, 40))
    return Response.json({ error: 'Too many lookups, wait a moment' }, { status: 429 })
  try {
    const page = await fetchPage(site)
    if (!page) return Response.json({ info: null })
    const info = readSiteInfo(page.html, page.url)
    if (!info.menu_url) info.menu_url = findMenuLinks(page.html, page.url, 1)[0] ?? null
    if (cache.size > 1000) cache.clear()
    cache.set(key, { at: Date.now(), info })
    return Response.json({ info })
  } catch {
    // Unreachable, blocked or not a public site: nothing to show, not an error for the user.
    return Response.json({ info: null })
  }
}
