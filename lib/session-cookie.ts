// E15 (Round 77): used by proxy.ts to send signed-out visitors the landing page directly.
/** Signed in on this browser? (Supabase keeps the session in "sb-<project>-auth-token" cookies.) */
export function hasSession(cookieNames: string[]) {
  return cookieNames.some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
}

/** Third pass #15: the new address for a request that came to the old *.vercel.app one, or null. */
export function movedTo(url: URL, siteUrl?: string | null, env?: string | null) {
  if (env !== 'production' || !siteUrl) return null
  let site: URL
  try {
    site = new URL(/^https?:\/\//.test(siteUrl) ? siteUrl : `https://${siteUrl}`)
  } catch {
    return null
  }
  if (!url.hostname.endsWith('.vercel.app') || url.hostname === site.hostname) return null
  if (url.pathname.startsWith('/api/')) return null
  return new URL(url.pathname + url.search, site.origin).toString()
}
