// Round 77: one setting for the site's address. Links people share (invites, posters, shared
// lists, public restaurant pages and profiles) and the address in link previews use
// NEXT_PUBLIC_SITE_URL when it's set in Vercel (e.g. after moving to Crumbs' own domain), so they
// keep pointing at the real address even when opened from a preview deployment. Without it they
// use the address Crumbs is open on, as before. Sign-in links always use the address you're on.
export const DEFAULT_SITE_URL = 'https://crumbs-shared-food-rating-app.vercel.app'

/** "https://example.com" (no trailing slash), or null when it isn't a usable address. */
export function cleanSiteUrl(value?: string | null) {
  const raw = (value ?? '').trim().replace(/\/+$/, '')
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`)
    return url.origin
  } catch {
    return null
  }
}

/** For the server (link previews, sitemaps): the setting, Vercel's production address, or the default. */
export function siteUrl() {
  return (
    cleanSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    cleanSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    DEFAULT_SITE_URL
  )
}

/** For links made on the phone: the setting, else the address Crumbs is open on. */
export function siteOrigin() {
  return (
    cleanSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    (typeof location === 'undefined' ? siteUrl() : location.origin)
  )
}
