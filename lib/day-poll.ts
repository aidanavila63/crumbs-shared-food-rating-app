// U17 (Round 93): pick-a-day poll on a plan — the order to show the days in, and the favourite.
export type PollOption = { id: string; starts_at: string; votes: string[] }

/** Soonest first; the one that works for the most people is the favourite (earliest on a tie). */
export function pollSummary(options: PollOption[]) {
  const sorted = [...options].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const most = Math.max(0, ...sorted.map((o) => o.votes.length))
  const favourite = most > 0 ? (sorted.find((o) => o.votes.length === most)?.id ?? null) : null
  return { sorted, favourite, most }
}

/** "yyyy-mm-ddThh:mm" (a datetime-local box) → ISO, or null when empty/bad/past. */
export function pollTime(local: string, now = new Date()) {
  if (!local) return null
  const at = new Date(local)
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() - 60_000) return null
  return at.toISOString()
}
