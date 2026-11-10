// The shared memory for website reads (tables site_read_cache and menu_read_cache). Server only:
// it uses the service-role key, because nobody else may read or write these tables. Without the
// key, or before the Round 57 SQL has run, every function quietly does nothing and the app works
// as before (each server just remembers for itself).
import { createClient } from '@supabase/supabase-js'
import type { SiteInfo } from './site-info'

// The two cache tables aren't in any generated types, so the client is left untyped.
type Db = any
let client: Db | null | undefined

function db(): Db | null {
  if (client !== undefined) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return client
}

/** What a site said when it was last read, if that was within `maxAgeMs`. `undefined` = never read / too old. */
export async function cachedSite(key: string, maxAgeMs: number): Promise<{ info: SiteInfo | null } | undefined> {
  const d = db()
  if (!d) return undefined
  try {
    const { data } = await d.from('site_read_cache').select('info,read_at').eq('site_key', key).maybeSingle()
    if (!data || Date.now() - new Date(data.read_at as string).getTime() > maxAgeMs) return undefined
    return { info: (data.info as SiteInfo | null) ?? null }
  } catch {
    return undefined
  }
}

export async function saveSite(key: string, info: SiteInfo | null) {
  const d = db()
  if (!d) return
  try {
    await d.from('site_read_cache').upsert({ site_key: key, info, read_at: new Date().toISOString() })
  } catch {
    // Remembering is a bonus.
  }
}

/** The dishes the AI found the last time this site's menu looked like `fingerprint`. */
export async function cachedMenu(key: string, fingerprint: string): Promise<unknown[] | undefined> {
  const d = db()
  if (!d) return undefined
  try {
    const { data } = await d.from('menu_read_cache').select('fingerprint,dishes').eq('site_key', key).maybeSingle()
    return data && data.fingerprint === fingerprint && Array.isArray(data.dishes) ? data.dishes : undefined
  } catch {
    return undefined
  }
}

export async function saveMenu(key: string, fingerprint: string, dishes: unknown[]) {
  const d = db()
  if (!d) return
  try {
    await d
      .from('menu_read_cache')
      .upsert({ site_key: key, fingerprint, dishes, read_at: new Date().toISOString() })
  } catch {
    // Remembering is a bonus.
  }
}
