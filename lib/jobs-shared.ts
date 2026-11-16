// Round 77 (E23): when Admin calls a scheduled chore overdue. Shared by the server and Admin.
/** How long without a successful run before Admin warns, per chore (hours). */
export const JOB_LATE_HOURS: Record<string, number> = {
  daily: 36,
  backup: 8 * 24 + 12,
}

export function jobIsLate(job: string, lastOk: string | null | undefined, now = Date.now()) {
  const hours = JOB_LATE_HOURS[job]
  if (!hours) return false
  if (!lastOk) return true
  return now - new Date(lastOk).getTime() > hours * 3600_000
}
