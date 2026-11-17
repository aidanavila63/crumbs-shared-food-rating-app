// The one daily job (scheduled in vercel.json, free):
//  #173 touches the database so a quiet week never lets it fall asleep,
//  #172 checks the free limits and raises Admin alerts (and a push to admins, if set up),
//  #141 reminds people about plans coming up (needs push keys),
//  #214 in the last 3 days of a month, reads queued menu PDFs with leftover AI allowance,
//  Part three: puts the usual hours back where special (holiday/seasonal) hours have ended,
//  Round 77: empties "Recently deleted" of anything older than 30 days,
//  Round 78: hibernation (see the chore at the end).
// Round 77 (E23): one chore failing no longer stops the rest (each has its own try), the run is
// recorded (Admin → Last runs), and the weekly backup has its own scheduled job (vercel.json →
// /api/backup, Mondays) so a slow day can't squeeze it out.
// Without CRON_SECRET it only does the harmless wake-up read.
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { limitAlerts, type LimitReport } from '@/lib/limits'
import { isMonthEnd, leftoverAi, processMenuQueue } from '@/lib/menu-queue'
import { recordJob } from '@/lib/jobs'
import { keepErrors } from '@/lib/server-errors'

export const runtime = 'nodejs'
export const maxDuration = 60

async function handleGET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secret = process.env.CRON_SECRET
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const trusted = !!secret && request.headers.get('authorization') === `Bearer ${secret}`
  const done: Record<string, unknown> = {}

  // #173 Wake-up: one tiny read anyone may do.
  if (url && (key || anon)) {
    const db = createClient(url, (trusted && key) || anon!, { auth: { persistSession: false } })
    const { error } = await db.from('feature_flags').select('key').limit(1)
    done.awake = !error
  }
  if (!trusted) return Response.json(done)
  if (!url || !key) return Response.json({ ...done, limits: 'needs SUPABASE_SERVICE_ROLE_KEY' })

  const db = createClient(url, key, { auth: { persistSession: false } })
  return recordJob(db, 'daily', async () => {
    // Each chore on its own: one failing is written down and the rest still run.
    const chore = async (name: string, work: () => Promise<unknown>) => {
      try {
        done[name] = await work()
      } catch (error: any) {
        done[name] = `failed: ${String(error?.message ?? error).slice(0, 200)}`
        done.failed = [...((done.failed as string[]) ?? []), name]
      }
    }

    // #172 Free-limit check.
    let report: LimitReport | null = null
    await chore('alerts', async () => {
      const { data, error } = await db.rpc('limit_report')
      if (error) throw new Error(error.message)
      report = data as LimitReport
      const alerts = limitAlerts(report)
      if (alerts.length) {
        const { data: fresh } = await db
          .from('admin_alerts')
          .upsert(alerts, { onConflict: 'kind,day', ignoreDuplicates: true })
          .select('kind,level,message')
        done.pushed = await pushAdmins(db, fresh ?? [])
      }
      return alerts.length
    })

    // #214 Last days of the month: spend the AI allowance that's left reading queued menu PDFs.
    if (report && isMonthEnd())
      await chore('menus', () => processMenuQueue(db, leftoverAi(report!.budgets)))

    // Part three: special hours whose last day has passed go back to the usual hours.
    await chore('special_hours_ended', async () => {
      const { data, error } = await db.rpc('end_seasonal_hours')
      if (error) throw new Error(error.message)
      return data
    })

    // #141 Plan reminders (the day before).
    await chore('reminders', () => remindPlans(db))

    // Round 77: Recently deleted keeps things 30 days.
    await chore('deleted_purged', async () => {
      const { data, error } = await db.rpc('purge_deleted')
      if (error) throw new Error(error.message)
      return data
    })

    // E30: website and menu reads older than 90 days are dropped (read again when needed).
    await chore('caches_trimmed', async () => {
      const { data, error } = await db.rpc('trim_read_caches')
      if (error) throw new Error(error.message)
      return data
    })

    // Round 78: hibernation — 12 months without opening Crumbs clears an account's push keys,
    // error records and usage counters (nothing the person wrote).
    await chore('hibernated', async () => {
      const { data, error } = await db.rpc('hibernate_quiet_accounts')
      if (error) throw new Error(error.message)
      return data
    })

    return done // a "failed" list marks the run as not OK in Admin
  })
}

/** New (not already raised today) warnings reach the admins' phones, if push is set up. */
async function pushAdmins(db: any, alerts: { level: string; message: string }[]) {
  const urgent = alerts.filter((a) => a.level !== 'info')
  if (!urgent.length) return 0
  const { data: admins } = await db.from('profiles').select('id').eq('is_admin', true)
  return pushTo(
    db,
    (admins ?? []).map((a: any) => a.id),
    {
      title: 'Crumbs admin',
      body: urgent.length === 1 ? urgent[0].message : `${urgent.length} limit warnings — see Admin`,
      tag: 'crumbs-admin',
    },
  )
}

/** #141 A reminder for plans in the next ~30 hours to everyone who hasn't said they can't come. */
async function remindPlans(db: any) {
  const { data: plans, error } = await db.rpc('plans_to_remind')
  if (error || !plans?.length) return 0
  let sent = 0
  for (const plan of plans as any[]) {
    const booking = [
      plan.booked_under ? `booked under ${plan.booked_under}` : null,
      plan.booking_ref ? `#${String(plan.booking_ref).replace(/^#/, '')}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    // people who switched plan reminders off are skipped
    const { data: prefs } = await db
      .from('profiles')
      .select('id,notify')
      .in('id', plan.people ?? [])
    const off = new Set(
      (prefs ?? []).filter((p: any) => p.notify?.plan === false).map((p: any) => p.id),
    )
    sent += await pushTo(
      db,
      (plan.people ?? []).filter((id: string) => !off.has(id)),
      {
        title: 'Coming up 🍽️',
        body: `${plan.title}${plan.place ? ` at ${plan.place}` : ''}${booking ? ` — ${booking}` : ''}`,
        tag: `crumbs-plan-${plan.id}`,
      },
    )
    await db.from('plans').update({ reminded_at: new Date().toISOString() }).eq('id', plan.id)
  }
  return sent
}

async function pushTo(
  db: any,
  userIds: string[],
  message: { title: string; body: string; tag: string },
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey || !userIds.length) return 0
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .in('user_id', userIds)
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:crumbs.foodapp@gmail.com',
    publicKey,
    privateKey,
  )
  const payload = JSON.stringify(message)
  let sent = 0
  await Promise.all(
    (subs ?? []).map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent += 1
      } catch {
        /* phone unsubscribed; the notify route tidies these up */
      }
    }),
  )
  return sent
}

// Third pass #9: unexpected failures go into Admin → Errors (Vercel keeps logs an hour).
export const GET = keepErrors('GET /api/daily', handleGET)
