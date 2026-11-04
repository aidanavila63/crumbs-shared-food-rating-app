// Profile handles (crumbs…/u/maya.eats). The database has the final say (reserved words, vulgar
// words, claimed restaurant names, taken names, the once-every-30-days rule); this only catches
// the obvious things while typing, and suggests a first handle.
export const HANDLE_MIN = 3
export const HANDLE_MAX = 20
export const HANDLE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/
export const HANDLE_CHANGE_DAYS = 30

/** What's wrong with this handle's shape (null = fine as far as the phone can tell). */
export function handleShapeProblem(raw: string): string | null {
  const h = raw.trim().toLowerCase()
  if (!h) return 'Pick a name for your link'
  if (h.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters`
  if (h.length > HANDLE_MAX) return `At most ${HANDLE_MAX} characters`
  if (!/^[a-z]/.test(h)) return 'Start with a letter'
  if (/\.\./.test(h)) return 'No two dots in a row'
  if (h.endsWith('.')) return "Can't end with a dot"
  if (!HANDLE_RE.test(h)) return 'Letters, numbers, _ and single dots only'
  return null
}

/** A starting suggestion from a display name: "Maya Chen" → "maya_chen". */
export function suggestHandle(name: string | null | undefined): string {
  const base = (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
    .slice(0, HANDLE_MAX)
  return base.length >= HANDLE_MIN ? base : 'foodie'
}

/** Days until a handle can change again (0 = now). `changedAt` is when it last changed. */
export function daysUntilHandleChange(changedAt: string | null | undefined, now = new Date()) {
  if (!changedAt) return 0
  const left = HANDLE_CHANGE_DAYS * 864e5 - (now.getTime() - new Date(changedAt).getTime())
  return left > 0 ? Math.ceil(left / 864e5) : 0
}
