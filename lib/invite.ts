// #44 Invite links: crumbs…/?join=ABC234 joins the group after you sign in.
const KEY = 'crumbs-pending-join'
const CODE = /^[A-HJ-NP-Z2-9]{6}$/
const DAY = 24 * 60 * 60 * 1000

export const isJoinCode = (code: string) => CODE.test(code)

export function inviteLink(
  code: string,
  origin = typeof location === 'undefined' ? '' : location.origin,
) {
  return `${origin}/?join=${encodeURIComponent(code)}`
}

/** Reads ?join=CODE from the address bar and remembers it (survives the sign-in email). */
export function captureJoinCode() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const code = url.searchParams.get('join')?.trim().toUpperCase()
  if (!code) return
  if (!isJoinCode(code)) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
  } catch {}
}

export function pendingJoinCode(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved || !isJoinCode(saved.code) || Date.now() - saved.at > DAY) return null
    return saved.code
  } catch {
    return null
  }
}

export function clearJoinCode() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

/** Removes ?join= from the address bar (run after Next's router has settled). */
export function stripJoinParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('join')) return
  url.searchParams.delete('join')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}
