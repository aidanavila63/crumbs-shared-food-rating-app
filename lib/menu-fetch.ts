// Fetches a restaurant's own website and pulls out readable text for menu extraction.
// The URL comes from saved place data, so it is treated as untrusted: only public http(s)
// hosts are allowed, redirects are re-checked, and size/time are capped.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export function isPrivateAddress(address: string) {
  if (address.includes(':')) {
    const lower = address.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7))
    return false
  }
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported link')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal'))
    throw new Error('Unsupported link')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address)))
    throw new Error('Unsupported link')
}

const MAX_BYTES = 1_500_000

export async function fetchPage(start: string): Promise<{ url: string; html: string } | null> {
  let url = new URL(start)
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(url)
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; CrumbsMenuReader/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null
      url = new URL(location, url)
      continue
    }
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('text/html') && !type.includes('xhtml')) return null
    const reader = response.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      size += value.length
    }
    reader.cancel().catch(() => {})
    return { url: url.toString(), html: Buffer.concat(chunks).toString('utf8') }
  }
  return null
}

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

// Finds links on the page that look like a menu page on the same site (skips PDFs/images).
export function findMenuLinks(html: string, base: string, limit = 2) {
  const found: string[] = []
  const baseUrl = new URL(base)
  const pattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) && found.length < limit) {
    const text = match[2].replace(/<[^>]+>/g, ' ').toLowerCase()
    const href = match[1]
    if (!/menu/.test(text) && !/menu/i.test(href)) continue
    if (/\.(pdf|jpe?g|png|webp|gif)(\?|$)/i.test(href)) continue
    try {
      const target = new URL(href, base)
      if (target.hostname !== baseUrl.hostname) continue
      const clean = target.toString()
      if (clean !== base && !found.includes(clean)) found.push(clean)
    } catch {}
  }
  return found
}

export async function readMenuText(website: string) {
  const home = await fetchPage(website)
  if (!home) return ''
  const pages = [htmlToText(home.html)]
  for (const link of findMenuLinks(home.html, home.url)) {
    try {
      const page = await fetchPage(link)
      if (page) pages.push(htmlToText(page.html))
    } catch {}
  }
  return pages.join('\n\n').slice(0, 14000)
}
