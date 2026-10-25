// #221 Forms start with what you picked last time (kind of visit, how many people, Want to try /
// Been). Kept on this phone only; Settings → Your preferences → "Remember my last choices".
const ON = 'crumbs-remember'
const KEY = 'crumbs-last-choices'

export function rememberOn() {
  try {
    return localStorage.getItem(ON) !== 'off'
  } catch {
    return false
  }
}

export function setRememberOn(on: boolean) {
  try {
    localStorage.setItem(ON, on ? 'on' : 'off')
    if (!on) localStorage.removeItem(KEY)
  } catch {}
}

/** What was picked last time in this form, or the fallback. */
export function recall<T>(form: string, field: string, fallback: T): T {
  if (typeof window === 'undefined' || !rememberOn()) return fallback
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')?.[form]?.[field]
    return saved === undefined ? fallback : (saved as T)
  } catch {
    return fallback
  }
}

export function remember(form: string, values: Record<string, unknown>) {
  if (!rememberOn()) return
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    all[form] = { ...all[form], ...values }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
}
