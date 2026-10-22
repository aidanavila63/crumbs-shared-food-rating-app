// Best-effort per-user throttle for the AI routes. On serverless each instance has its own
// memory, so this is a safety net against runaway taps/loops, not a hard quota.
const hits = new Map<string, number[]>()

export function tooManyRequests(userId: string, limit = 12, windowMs = 10 * 60 * 1000) {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter((time) => now - time < windowMs)
  if (recent.length >= limit) {
    hits.set(userId, recent)
    return true
  }
  recent.push(now)
  hits.set(userId, recent)
  return false
}
