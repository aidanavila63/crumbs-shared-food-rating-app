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
