// #44 Invite links: crumbs…/invite/ABC234 opens the invite page for that group (old links
// crumbs…/?join=ABC234 are sent there too). Member codes are 6 letters/numbers, guest codes 7.
import { siteOrigin } from './site.ts'
const KEY = 'crumbs-pending-join'
const CODE = /^[A-Z0-9]{6,8}$/
const DAY = 24 * 60 * 60 * 1000

export const cleanCode = (code: string | null | undefined) => (code ?? '').trim().toUpperCase()
export const isJoinCode = (code: string) => CODE.test(code)

export function invitePath(code: string) {
  return `/invite/${encodeURIComponent(cleanCode(code))}`
}

/** The link to share. `by` (who's sharing it) shows on Aidan's "Wants to join" list (third pass #19). */
export function inviteLink(code: string, origin = siteOrigin(), by?: string | null) {
  return `${origin}${invitePath(code)}${by ? `?by=${encodeURIComponent(by)}` : ''}`
}

const BY_KEY = 'crumbs-invited-by'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Remember who shared the invite link you opened (kept through sign-in, like the invite). */
export function rememberInviter(by: string | null | undefined) {
  if (!by || !UUID.test(by)) return
  try {
    localStorage.setItem(BY_KEY, by)
  } catch {}
}

export function inviter() {
  try {
    const by = localStorage.getItem(BY_KEY)
    return by && UUID.test(by) ? by : null
  } catch {
    return null
  }
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
    localStorage.removeItem(BY_KEY)
  } catch {}
}
