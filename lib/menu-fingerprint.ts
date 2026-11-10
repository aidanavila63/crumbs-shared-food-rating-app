// A short fingerprint of a website's menu text, so Crumbs can tell "same menu as last time" from
// "the menu changed" without asking the AI again. Wording, prices and dish names all count;
// capitals, spacing and punctuation don't.
import { createHash } from 'node:crypto'

export function menuFingerprint(text: string) {
  const plain = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.$€£]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha1').update(plain).digest('hex')
}

/** The key a site is remembered under: host and path, no scheme, "www." or trailing slash. */
export function siteKey(site: string) {
  try {
    const url = new URL(site)
    return (url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '')).toLowerCase().slice(0, 300)
  } catch {
    return site.replace(/\/+$/, '').toLowerCase().slice(0, 300)
  }
}
