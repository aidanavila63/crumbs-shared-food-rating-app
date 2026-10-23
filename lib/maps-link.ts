// Reads a pasted Google Maps link. Pure parsing here; the API route follows short-link redirects.
const GOOGLE_HOST = /^(www\.|maps\.)?google\.[a-z.]{2,6}$/i

export function isMapsHost(host: string, path: string) {
  const h = host.toLowerCase()
  if (h === 'maps.app.goo.gl') return true
  if (h === 'goo.gl') return path.startsWith('/maps')
  if (h === 'maps.google.com') return true
  return GOOGLE_HOST.test(h) && path.startsWith('/maps')
}

export type ParsedMapsLink = { name: string; lat: number | null; lng: number | null }

export function parseMapsUrl(raw: string): ParsedMapsLink | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const text = decodeURIComponent(url.pathname.replace(/\+/g, ' '))
  let name = ''
  const place = /\/maps\/place\/([^/@]+)/.exec(text)
  if (place) name = place[1].trim()
  if (!name) name = (url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').trim()
  if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(name)) name = ''
  if (!name) return null
  const full = decodeURIComponent(url.pathname + url.search)
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(full) ?? /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(full)
  return { name, lat: pin ? Number(pin[1]) : null, lng: pin ? Number(pin[2]) : null }
}
