import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { fetchPage, findMenuLinks } from '@/lib/menu-fetch'
import { readSiteInfo, siteFacts, type SiteInfo } from '@/lib/site-info'
import { cleanWebsite } from '@/lib/osm'

// Reads a restaurant's own website (only where its robots.txt allows) for hours, phone,
// cuisine, price, address and menu link. GET shows them on the place page; POST saves them on
// the shared restaurant profile as Crumbs' own facts — the restaurant published them itself,
// so unlike Google's they can be kept. Cached for a day per site.
const cache = new Map<string, { at: number; info: SiteInfo | null }>()
export const maxDuration = 15
const RECHECK_DAYS = 30

async function readSite(site: string): Promise<SiteInfo | null> {
  const key = site.replace(/\/+$/, '').toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 864e5) return hit.info
  let info: SiteInfo | null = null
  try {
    const page = await fetchPage(site)
    if (page) {
      info = readSiteInfo(page.html, page.url)
      if (!info.menu_url) info.menu_url = findMenuLinks(page.html, page.url, 1)[0] ?? null
    }
  } catch {
    // Unreachable, not public, or its robots.txt says no: nothing to show, not an error.
  }
  if (cache.size > 1000) cache.clear()
  cache.set(key, { at: Date.now(), info })
  return info
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const site = cleanWebsite(new URL(request.url).searchParams.get('url'))
  if (!site) return Response.json({ error: 'Need a website' }, { status: 400 })
  if (tooManyRequests(`site:${data.user.id}`, 40))
    return Response.json({ error: 'Too many lookups, wait a moment' }, { status: 429 })
  return Response.json({ info: await readSite(site) })
}

/** Save what a restaurant's website says onto its shared profile (at most monthly). */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  if (tooManyRequests(`site-merge:${data.user.id}`, 20))
    return Response.json({ error: 'Slow down a little' }, { status: 429 })
  const { restaurantId, utc } = await request.json().catch(() => ({}))
  if (typeof restaurantId !== 'string')
    return Response.json({ error: 'Missing restaurant' }, { status: 400 })
  // Row-level security: only restaurants one of your groups has saved.
  const { data: r } = await supabase
    .from('restaurants')
    .select('id,name,website,latitude,longitude,opening_hours,site_checked_at')
    .eq('id', restaurantId)
    .maybeSingle()
  if (!r) return Response.json({ error: 'Restaurant not found' }, { status: 404 })
  if (r.site_checked_at && Date.now() - new Date(r.site_checked_at).getTime() < RECHECK_DAYS * 864e5)
    return Response.json({ applied: [], skipped: true })
  const site = cleanWebsite(r.website)
  const info = site ? await readSite(site) : null
  const offset = Number.isFinite(r.opening_hours?.utc) ? r.opening_hours.utc : Number(utc) || 0
  const facts = site
    ? siteFacts(info, {
        name: r.name,
        website: /^https?:\/\//i.test(r.website ?? '') ? r.website : site,
        latitude: r.latitude,
        longitude: r.longitude,
        utc: offset,
      })
    : {}
  // Record the check even when nothing was found, so it isn't tried again for a month.
  const { data: result, error } = await supabase.rpc('merge_site_data', {
    target: r.id,
    data: facts,
  })
  if (error) return Response.json({ error: error.message }, { status: 403 })
  return Response.json({ applied: result?.applied ?? [] })
}
