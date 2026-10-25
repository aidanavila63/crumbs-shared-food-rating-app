// #172 Early warnings before a free limit is reached. Pure maths so it can be tested; the daily
// job (app/api/daily) feeds it the numbers from limit_report() and saves what it returns.

export const FREE_LIMITS = {
  /** database size on the free plan */
  dbBytes: 500 * 1024 * 1024,
  /** photo storage on the free plan */
  storageBytes: 1024 * 1024 * 1024,
}

export type LimitReport = {
  db_bytes: number
  storage_bytes: number
  budgets: {
    kind: string
    note: string | null
    daily_total: number | null
    monthly_total: number | null
    today: number
    month: number
  }[]
}

export type Alert = { kind: string; level: 'info' | 'warn' | 'stop'; message: string }

const pct = (used: number, limit: number) => Math.round((used / limit) * 100)
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`

/** #226 Month-to-date usage stretched to the whole month. */
export function monthPace(monthSoFar: number, today = new Date()) {
  const day = today.getDate()
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return Math.round((monthSoFar / Math.max(1, day)) * days)
}

export function limitAlerts(report: LimitReport, today = new Date()): Alert[] {
  const alerts: Alert[] = []
  const size = (kind: string, label: string, used: number, limit: number) => {
    const p = pct(used, limit)
    if (p >= 80)
      alerts.push({
        kind,
        level: p >= 95 ? 'stop' : 'warn',
        message: `${label} is at ${p}% of the free limit (${mb(used)} of ${mb(limit)}).`,
      })
  }
  size('db_size', 'Database', report.db_bytes, FREE_LIMITS.dbBytes)
  size('storage_size', 'Photo storage', report.storage_bytes, FREE_LIMITS.storageBytes)
  for (const b of report.budgets ?? []) {
    const label = b.note || b.kind
    if (b.daily_total && b.today >= b.daily_total * 0.9)
      alerts.push({
        kind: `daily_${b.kind}`,
        level: b.today >= b.daily_total ? 'stop' : 'warn',
        message: `${label}: ${b.today} of ${b.daily_total} used today.`,
      })
    if (b.monthly_total) {
      const pace = monthPace(b.month, today)
      if (b.month >= b.monthly_total * 0.8)
        alerts.push({
          kind: `month_${b.kind}`,
          level: b.month >= b.monthly_total ? 'stop' : 'warn',
          message: `${label}: ${b.month} of ${b.monthly_total} used this month.`,
        })
      else if (pace > b.monthly_total)
        alerts.push({
          kind: `pace_${b.kind}`,
          level: 'info',
          message: `${label}: on pace for ~${pace} this month (limit ${b.monthly_total}). It stops at the limit.`,
        })
    }
  }
  return alerts
}
