// Someone on a public restaurant page taps "Save to try": if they're signed out, Crumbs remembers
// which restaurant (for an hour) and adds it as soon as they're signed in — the same add flow the
// "Find us on Crumbs" poster uses (?add=<restaurant id>).
const KEY = 'crumbs-pending-add'
const HOUR = 60 * 60 * 1000
const ID = /^[0-9a-f-]{36}$/i

export function rememberPendingAdd(restaurantId: string) {
  if (!ID.test(restaurantId)) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: restaurantId, at: Date.now() }))
  } catch {}
}

/** The restaurant remembered in the last hour (and forgets it). */
export function takePendingAdd(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    localStorage.removeItem(KEY)
    const { id, at } = JSON.parse(raw) as { id: string; at: number }
    return ID.test(id) && now - at < HOUR ? id : null
  } catch {
    return null
  }
}

export const addLink = (restaurantId: string) => `/?add=${encodeURIComponent(restaurantId)}`

// U11 (Round 95): the same for "Save to my Crumbs" on a shared list page (?addlist=<token>).
const LIST_KEY = 'crumbs-pending-list'
const TOKEN = /^[a-f0-9]{16,128}$/

export function rememberPendingList(token: string) {
  if (!TOKEN.test(token)) return
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify({ token, at: Date.now() }))
  } catch {}
}

export function takePendingList(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    if (!raw) return null
    localStorage.removeItem(LIST_KEY)
    const { token, at } = JSON.parse(raw) as { token: string; at: number }
    return TOKEN.test(token) && now - at < HOUR ? token : null
  } catch {
    return null
  }
}
