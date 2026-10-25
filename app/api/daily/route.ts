// The one daily job (scheduled in vercel.json, free):
//  #173 touches the database so a quiet week never lets it fall asleep,
//  #172 checks the free limits and raises Admin alerts (and a push to admins, if set up),
//  #141 reminds people about plans coming up (needs push keys),
//  #89  makes the weekly backup on Mondays.
// Without CRON_SECRET it only does the harmless wake-up read.
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { limitAlerts, type LimitReport } from '@/lib/limits'
import { runBackup } from '@/lib/run-backup'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
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

  // #172 Free-limit check.
  const db = createClient(url, key, { auth: { persistSession: false } })
  const { data: report, error } = await db.rpc('limit_report')
  if (error) done.limits = error.message
  else {
    const alerts = limitAlerts(report as LimitReport)
    done.alerts = alerts.length
    if (alerts.length) {
      const { data: fresh } = await db
        .from('admin_alerts')
        .upsert(alerts, { onConflict: 'kind,day', ignoreDuplicates: true })
        .select('kind,level,message')
      done.pushed = await pushAdmins(db, fresh ?? [])
    }
  }

  // #141 Plan reminders (the day before).
  done.reminders = await remindPlans(db)

  // #89 Weekly backup (Mondays).
  if (new Date().getUTCDay() === 1) done.backup = await (await runBackup()).json()
  return Response.json(done)
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
    sent += await pushTo(db, plan.people ?? [], {
      title: 'Coming up 🍽️',
      body: `${plan.title}${plan.place ? ` at ${plan.place}` : ''}${booking ? ` — ${booking}` : ''}`,
      tag: `crumbs-plan-${plan.id}`,
    })
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
    process.env.VAPID_SUBJECT || 'mailto:crumbs@example.com',
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
