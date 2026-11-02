// #44 Invite links: crumbs…/invite/ABC234 opens the invite page for that group (old links
// crumbs…/?join=ABC234 are sent there too). Member codes are 6 letters/numbers, guest codes 7.
const KEY = 'crumbs-pending-join'
const CODE = /^[A-Z0-9]{6,8}$/
const DAY = 24 * 60 * 60 * 1000

export const cleanCode = (code: string | null | undefined) => (code ?? '').trim().toUpperCase()
export const isJoinCode = (code: string) => CODE.test(code)

export function invitePath(code: string) {
  return `/invite/${encodeURIComponent(cleanCode(code))}`
}

export function inviteLink(
  code: string,
  origin = typeof location === 'undefined' ? '' : location.origin,
) {
  return `${origin}${invitePath(code)}`
}

/** Remember the invite you opened, so signing in (which leaves the page) brings you back to it. */
export function rememberInvite(code: string) {
  const clean = cleanCode(code)
  if (!isJoinCode(clean)) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: clean, at: Date.now() }))
  } catch {}
}

/** The invite you opened in the last day (and when), if any. */
export function pendingInvite(): { code: string; at: number } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved || !isJoinCode(saved.code) || Date.now() - saved.at > DAY) return null
    return { code: saved.code, at: saved.at }
  } catch {
    return null
  }
}

export function clearJoinCode() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
