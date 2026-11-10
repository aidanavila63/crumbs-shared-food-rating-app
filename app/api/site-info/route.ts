import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { fetchPage, findMenuLinks } from '@/lib/menu-fetch'
import { readSiteInfo, siteFacts, type SiteInfo } from '@/lib/site-info'
import { cleanWebsite } from '@/lib/osm'
import { takeAllowance } from '@/lib/allowance'
import { cachedSite, saveSite } from '@/lib/read-cache'
import { siteKey } from '@/lib/menu-fingerprint'

// Reads a restaurant's own website (only where its robots.txt allows) for hours, phone,
// cuisine, price, address and menu link. GET shows them on the place page; POST saves them on
// the shared restaurant profile as Crumbs' own facts — the restaurant published them itself,
// so unlike Google's they can be kept, along with the page they came from. Cached for a day per
// site; every fresh read counts against the 'website' budget (Admin → Spending guard).
const cache = new Map<string, { at: number; info: SiteInfo | null }>()
export const maxDuration = 15
const RECHECK_DAYS = 30
const SHARED_CACHE_MS = 2 * 864e5

/**
 * The site's own facts. A cached answer is free; a fresh read first takes one use from the
 * 'website' allowance. `over` means the allowance is used up (nothing was fetched or cached).
 */
async function readSite(
  site: string,
  allowed: () => Promise<boolean>,
): Promise<{ info: SiteInfo | null; over: boolean }> {
  const key = site.replace(/\/+$/, '').toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 864e5) return { info: hit.info, over: false }
  // Another server (or another restaurant on the same site) may have read it already: free.
  const shared = await cachedSite(siteKey(site), SHARED_CACHE_MS)
  if (shared) {
    cache.set(key, { at: Date.now(), info: shared.info })
    return { info: shared.info, over: false }
  }
  if (!(await allowed())) return { info: null, over: true }
  let info: SiteInfo | null = null
  try {
    const page = await fetchPage(site)
    if (page) {
      info = readSiteInfo(page.html, page.url)
      info.page_url = page.url
      if (!info.menu_url) info.menu_url = findMenuLinks(page.html, page.url, 1)[0] ?? null
    }
  } catch {
    // Unreachable, not public, or its robots.txt says no: nothing to show, not an error.
  }
  if (cache.size > 1000) cache.clear()
  cache.set(key, { at: Date.now(), info })
  await saveSite(siteKey(site), info)
  return { info, over: false }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const site = cleanWebsite(new URL(request.url).searchParams.get('url'))
  if (!site) return Response.json({ error: 'Need a website' }, { status: 400 })
  if (tooManyRequests(`site:${data.user.id}`, 40))
    return Response.json({ error: 'Too many lookups, wait a moment' }, { status: 429 })
  const { info, over } = await readSite(site, async () => (await takeAllowance(supabase, 'website')).ok)
  return Response.json(over ? { info, budget: true } : { info })
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
  const read = site
    ? await readSite(site, async () => (await takeAllowance(supabase, 'website')).ok)
    : { info: null, over: false }
  // Budget used up: try again later (don't record a check, or it would wait a month).
  if (read.over) return Response.json({ applied: [], budget: true })
  const info = read.info
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
  // A booking link is kept for later but stays hidden until an admin switches it on.
  if ((facts as { reservations?: string }).reservations)
    await supabase
      .rpc('hold_reservation_link', { target: r.id, link: (facts as { reservations?: string }).reservations })
      .then(() => {}, () => {})
  return Response.json({ applied: result?.applied ?? [] })
}
