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

/** #164 Something shared to Crumbs from another app (title / text / url): a map link to read,
 *  or else a name to search for. */
export function fromShare(params: URLSearchParams): { link: string | null; name: string | null } {
  const title = (params.get('title') ?? '').trim()
  const text = (params.get('text') ?? '').trim()
  const urls = [params.get('url') ?? '', ...text.split(/\s+/)].filter((part) =>
    /^https?:\/\//i.test(part),
  )
  const link =
    urls.find((raw) => {
      try {
        const u = new URL(raw)
        return isMapsHost(u.hostname, u.pathname)
      } catch {
        return false
      }
    }) ?? null
  const words = (title || text.replace(/https?:\/\/\S+/g, '').split(/\n/)[0]).trim()
  return { link, name: link ? null : words.slice(0, 120) || null }
}
