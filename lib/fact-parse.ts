// Reading a phone number or website off a photo (door sign, business card, receipt header,
// takeout bag) so a quick question can be answered with "Snap a picture".

/** The first thing that looks like a phone number: "(416) 555-0199", "+1 416.555.0199", "416 555 0199". */
export function findPhone(text: string): string | null {
  const matches = text.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g) ?? []
  for (const raw of matches) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 13) continue
    // Looks like a date, total or card number run-on? Skip long runs with no separators.
    if (/^\d{11,}$/.test(raw.trim()) && !raw.trim().startsWith('+')) continue
    if (digits.length === 10)
      return `+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    if (digits.length === 11 && digits.startsWith('1'))
      return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    return raw.trim().startsWith('+') ? raw.trim() : `+${digits}`
  }
  return null
}

const NOT_THEIRS =
  /(facebook|instagram|tiktok|twitter|x\.com|google|yelp|ubereats|doordash|skipthedishes|grubhub|tripadvisor|opentable|square|toasttab|clover)\./i

/** The first web address that's probably the restaurant's own site (not social or delivery apps). */
export function findWebsite(text: string): string | null {
  const re =
    /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]{1,62}(?:\.[a-z0-9-]{2,63})*\.[a-z]{2,12}(?:\/[^\s]*)?/gi
  for (const m of text.matchAll(re)) {
    const raw = m[0]
    // Part of an email address ("hello@site.com")? That's not where people look things up.
    if (text[(m.index ?? 0) - 1] === '@' || raw.includes('@')) continue
    const host = raw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .toLowerCase()
    if (NOT_THEIRS.test(host) || /^\d+(\.\d+)+$/.test(host)) continue
    if (
      !/\.(com|ca|net|org|co|io|restaurant|kitchen|cafe|bar|pizza|menu|food|biz|info|us|uk|au|nz|de|fr|it|es|jp|kr|mx)$/.test(
        host,
      )
    )
      continue
    return `https://${host}`
  }
  return null
}
