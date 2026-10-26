'use client'
// #21 Admin page (only for accounts with profiles.is_admin): usage counts (#111), feedback inbox
// (#108), feature flags (#109), error log (#110) and the waitlist (#94).
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Trash2 } from 'lucide-react'
import { haptic } from '@/lib/motion'
import { timeAgo } from './social'
import { analyticsOn } from '@/lib/analytics'
import { DAY_CAPS, POINTS, type DayCaps, type PointRules } from '@/lib/tiers'
import { BACKUP_BUCKET } from '@/lib/backup'
import { monthPace } from '@/lib/limits'
import { Switch } from './switch'

type Flag = { key: string; state: 'off' | 'admin' | 'everyone'; note: string | null }
type Feedback = { id: string; body: string; page: string | null; created_at: string }
type ClientError = { id: number; message: string; url: string | null; created_at: string }
type Waiting = { id: string; email: string; created_at: string }

const STATES: Flag['state'][] = ['off', 'admin', 'everyone']
const LABELS: Record<string, string> = {
  users: 'People',
  groups: 'Groups',
  places: 'Places',
  ratings: 'Ratings',
  visits: 'Visits',
  meals: 'Home meals',
  active_7d: 'Active this week',
  waitlist: 'Waitlist',
  feedback: 'Feedback',
  restaurants: 'Shared restaurants',
  menu_dishes: 'Menu dishes',
}

const demoData = {
  stats: {
    users: 2,
    groups: 1,
    places: 4,
    ratings: 6,
    visits: 3,
    meals: 2,
    active_7d: 2,
    waitlist: 1,
    feedback: 1,
    restaurants: 4,
    menu_dishes: 4,
    owned_hours: 1,
    owned_address: 3,
    facts: 5,
    claimed_facts: 2,
    claimed_dishes: 1,
    borrowed_fields: 9,
    db_bytes: 38 * 1024 ** 2,
    storage_bytes: 120 * 1024 ** 2,
  },
  feedback: [
    {
      id: 'f1',
      body: 'Love the new home cooking tab!',
      page: 'settings',
      created_at: new Date().toISOString(),
    },
  ],
  flags: [{ key: 'ai_ideas', state: 'admin', note: 'AI dinner ideas' }] as Flag[],
  errors: [] as ClientError[],
  waitlist: [{ id: 'w1', email: 'friend@example.com', created_at: new Date().toISOString() }],
}

const mb = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${Math.round(bytes / 1024 ** 2)} MB`

/** Free-tier meter: green → amber at 60% → red at 80%. */
function Meter({
  label,
  used,
  limit,
  hint,
}: {
  label: string
  used: number
  limit: number
  hint: string
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const tone = pct >= 80 ? 'meter-red' : pct >= 60 ? 'meter-amber' : 'meter-green'
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span>
          {mb(used)} · {pct}%
        </span>
      </div>
      <span className={`owned-bar mt-1 ${tone}`}>
        <span className="bar-fill" style={{ width: `${Math.max(2, pct)}%` }} />
      </span>
      {pct >= 60 && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function AdminPanel({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [errors, setErrors] = useState<ClientError[]>([])
  const [waitlist, setWaitlist] = useState<Waiting[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    if (demo) {
      setStats(demoData.stats)
      setFeedback(demoData.feedback)
      setFlags(demoData.flags)
      setErrors(demoData.errors)
      setWaitlist(demoData.waitlist)
      return setLoading(false)
    }
    const [s, f, fl, e, w] = await Promise.all([
      supabase.rpc('admin_stats'),
      supabase
        .from('feedback')
        .select('id,body,page,created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('feature_flags').select('key,state,note').order('key'),
      supabase
        .from('client_errors')
        .select('id,message,url,created_at')
        .order('id', { ascending: false })
        .limit(40),
      supabase
        .from('waitlist')
        .select('id,email,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    if (s.error) toast.error(s.error.message)
    setStats(s.data ?? null)
    setFeedback(f.data ?? [])
    setFlags(fl.data ?? [])
    setErrors(e.data ?? [])
    setWaitlist(w.data ?? [])
    setLoading(false)
  }, [demo, supabase])

  useEffect(() => {
    load()
  }, [load])

  async function setFlag(key: string, state: Flag['state'], note?: string | null) {
    haptic('select')
    const before = flags
    const next = flags.some((f) => f.key === key)
      ? flags.map((f) => (f.key === key ? { ...f, state } : f))
      : [...flags, { key, state, note: note ?? null }]
    setFlags(next)
    if (demo) return
    const { error } = await supabase.from('feature_flags').upsert({
      key,
      state,
      note: note ?? next.find((f) => f.key === key)?.note ?? null,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      setFlags(before)
      toast.error(error.message)
    }
  }

  async function remove(table: string, id: string | number, after: () => void) {
    if (!demo) {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) return toast.error(error.message)
    }
    after()
  }

  return (
    <div className="stagger flex flex-col gap-4">
      <section className="surface settings-card">
        <div className="flex items-center justify-between">
          <h3 className="settings-heading">Usage</h3>
          <button className="icon-btn" aria-label="Refresh" onClick={load} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {stats ? (
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(LABELS).map(([key, label]) => (
              <div key={key} className="surface-soft">
                <p className="font-serif text-2xl text-primary">{stats[key] ?? 0}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="skeleton h-24" />
        )}
        {stats && (
          <div className="flex flex-col gap-3">
            <Meter
              label="Database (free: 500 MB)"
              used={stats.db_bytes ?? 0}
              limit={500 * 1024 ** 2}
              hint="Move shared restaurant tables to Cloudflare D1 (5 GB free) or go Supabase Pro ($25/mo, 8 GB) before this fills."
            />
            <Meter
              label="Photos (free: 1 GB)"
              used={stats.storage_bytes ?? 0}
              limit={1024 ** 3}
              hint="When this passes ~80%, add the R2 settings in Vercel (repo DEVLOG Round 22): new photos then go to Cloudflare R2 (10 GB free, no download fees)."
            />
            <div>
              <p className="text-sm font-semibold">Data Crumbs owns</p>
              <p className="text-xs text-muted-foreground">
                Restaurants whose hours / address came from members or OpenStreetMap (kept forever),
                not Google (borrowed).
              </p>
              {(['owned_hours', 'owned_address'] as const).map((key) => {
                const pct = stats.restaurants
                  ? Math.round(((stats[key] ?? 0) / stats.restaurants) * 100)
                  : 0
                return (
                  <div key={key} className="mt-1 flex items-center gap-2 text-sm">
                    <span className="w-16 shrink-0">
                      {key === 'owned_hours' ? 'Hours' : 'Address'}
                    </span>
                    <span className="owned-bar flex-1">
                      <span className="bar-fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-10 text-right font-semibold">{pct}%</span>
                  </div>
                )
              })}
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.facts ?? 0} details added by members · {stats.claimed_facts ?? 0} details and{' '}
                {stats.claimed_dishes ?? 0} menu dishes cross-checked by 2+ groups (claimed as
                Crumbs’ own).
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Going-public check: {stats.borrowed_fields ?? 0} details are still only Google’s and
                would need to be shown live (not stored) or replaced.
              </p>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Counts only — no personal data. Supabase and Vercel dashboards show storage and bandwidth.
        </p>
        <p className="text-xs text-muted-foreground">
          {analyticsOn ? (
            <>
              Detailed usage (screens, features used, active days) is in{' '}
              <a
                className="underline"
                href="https://app.posthog.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                PostHog
              </a>
              .
            </>
          ) : (
            'PostHog analytics is off — add NEXT_PUBLIC_POSTHOG_KEY in Vercel to turn it on.'
          )}
        </p>
      </section>

      <BudgetsCard supabase={supabase} demo={demo} />
      <PointsCard supabase={supabase} demo={demo} />
      <BuildersCard supabase={supabase} demo={demo} />
      <BackupsCard supabase={supabase} demo={demo} />
      <QualityCard supabase={supabase} demo={demo} />
      <MenuQueueCard supabase={supabase} demo={demo} />
      <ClaimsCard supabase={supabase} demo={demo} />
      <section className="surface settings-card">
        <h3 className="settings-heading">Feature switches</h3>
        <p className="text-sm text-muted-foreground">
          <strong>Admin</strong> = only you can see it (e.g. AI features while credits last).
          <strong> Everyone</strong> = all groups. Switches are built into the app; new ones appear
          here when a feature needs one.
        </p>
        {flags.map((flag) => (
          <div key={flag.key} className="flex flex-col gap-1">
            <span className="font-mono text-sm font-bold">{flag.key}</span>
            {flag.note && <span className="text-xs text-muted-foreground">{flag.note}</span>}
            <div
              className="segmented segmented-3"
              role="radiogroup"
              aria-label={`${flag.key} state`}
            >
              <span
                className="segmented-thumb"
                aria-hidden="true"
                style={{ transform: `translateX(${STATES.indexOf(flag.state) * 100}%)` }}
              />
              {STATES.map((state) => (
                <button
                  key={state}
                  role="radio"
                  aria-checked={flag.state === state}
                  className={flag.state === state ? 'segmented-active' : ''}
                  onClick={() => setFlag(flag.key, state)}
                >
                  {state === 'off' ? 'Off' : state === 'admin' ? 'Admin' : 'Everyone'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="surface settings-card">
        <h3 className="settings-heading">Feedback ({feedback.length})</h3>
        {feedback.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        {feedback.map((item) => (
          <div key={item.id} className="surface-soft flex items-start justify-between gap-2">
            <p className="text-sm">
              {item.body}
              <span className="block text-xs text-muted-foreground">
                {timeAgo(item.created_at)}
                {item.page ? ` · ${item.page}` : ''}
              </span>
            </p>
            <button
              className="icon-btn shrink-0"
              aria-label="Delete feedback"
              onClick={() =>
                remove('feedback', item.id, () =>
                  setFeedback((c) => c.filter((f) => f.id !== item.id)),
                )
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </section>

      <section className="surface settings-card">
        <h3 className="settings-heading">Error log ({errors.length})</h3>
        {errors.length === 0 && (
          <p className="text-sm text-muted-foreground">No errors reported. 🎉</p>
        )}
        {errors.map((item) => (
          <div key={item.id} className="surface-soft flex items-start justify-between gap-2">
            <p className="min-w-0 break-words font-mono text-xs">
              {item.message}
              <span className="block text-muted-foreground">
                {timeAgo(item.created_at)}
                {item.url ? ` · ${item.url}` : ''}
              </span>
            </p>
            <button
              className="icon-btn shrink-0"
              aria-label="Delete error"
              onClick={() =>
                remove('client_errors', item.id, () =>
                  setErrors((c) => c.filter((x) => x.id !== item.id)),
                )
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </section>

      <section className="surface settings-card">
        <div className="flex items-center justify-between">
          <h3 className="settings-heading">Waitlist ({waitlist.length})</h3>
          {waitlist.length > 0 && (
            <button
              className="secondary !min-h-10 !px-3 text-sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(waitlist.map((w) => w.email).join(', '))
                  .then(() => toast.success('Emails copied'))
              }
            >
              Copy emails
            </button>
          )}
        </div>
        {waitlist.length === 0 && <p className="text-sm text-muted-foreground">No one yet.</p>}
        {waitlist.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{item.email}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {timeAgo(item.created_at)}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}

type Budget = {
  kind: string
  note: string
  daily_total: number | null
  monthly_total: number | null
  per_tier: number[]
  today: number
  month: number
}

/** Spending guard: today's / this month's use of everything that costs money or free quota. */
function BudgetsCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [rows, setRows] = useState<Budget[] | null>(null)
  const load = useCallback(async () => {
    if (demo)
      return setRows([
        {
          kind: 'ai',
          note: 'AI ideas',
          daily_total: 150,
          monthly_total: 3000,
          per_tier: [3, 4, 5, 6, 8],
          today: 12,
          month: 240,
        },
        {
          kind: 'google',
          note: 'Google place details + hours',
          daily_total: 40,
          monthly_total: 900,
          per_tier: [10, 12, 15, 18, 20],
          today: 9,
          month: 310,
        },
      ])
    const { data, error } = await supabase.rpc('usage_today')
    if (!error) setRows(data ?? [])
  }, [demo, supabase])
  useEffect(() => {
    load()
  }, [load])
  async function save(b: Budget, changes: Partial<Budget>) {
    const next = { ...b, ...changes }
    setRows((current) => current?.map((r) => (r.kind === b.kind ? next : r)) ?? null)
    if (demo) return
    const { error } = await supabase.rpc('set_budget', {
      what: b.kind,
      daily: next.daily_total,
      monthly: next.monthly_total,
      tiers: next.per_tier,
    })
    if (error) toast.error(error.message)
    else toast.success('Budget saved')
  }
  if (!rows?.length) return null
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v)) || 0))
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Spending guard</h3>
      <p className="text-sm text-muted-foreground">
        Everything that costs money or uses a free quota stops at these totals, whatever anyone’s
        tier. Per-person allowances are by tier (Taster → Legend).
      </p>
      {rows.map((b) => {
        const day = b.daily_total ? Math.min(100, Math.round((b.today / b.daily_total) * 100)) : 0
        const month = b.monthly_total
          ? Math.min(100, Math.round((b.month / b.monthly_total) * 100))
          : 0
        const tone = (pct: number) =>
          pct >= 80 ? 'meter-red' : pct >= 60 ? 'meter-amber' : 'meter-green'
        return (
          <div key={b.kind} className="surface-soft flex flex-col gap-2">
            <p className="font-semibold">{b.note || b.kind}</p>
            <div className="text-xs">
              Today {b.today}
              {b.daily_total ? ` of ${b.daily_total}` : ''}
              <span className={`owned-bar mt-1 ${tone(day)}`}>
                <span className="bar-fill" style={{ width: `${Math.max(2, day)}%` }} />
              </span>
            </div>
            {b.monthly_total ? (
              <div className="text-xs">
                This month {b.month} of {b.monthly_total}
                <span className={`owned-bar mt-1 ${tone(month)}`}>
                  <span className="bar-fill" style={{ width: `${Math.max(2, month)}%` }} />
                </span>
                {b.month > 0 && (
                  <span
                    className={`mt-1 block ${monthPace(b.month) > b.monthly_total ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
                  >
                    At this pace ~{monthPace(b.month)} by month end
                    {monthPace(b.month) > b.monthly_total ? ' — it will stop at the limit' : ''}
                  </span>
                )}
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <label className="flex flex-col gap-1">
                Per day
                <input
                  className="field !min-h-9 !py-1 text-sm"
                  inputMode="numeric"
                  defaultValue={b.daily_total ?? ''}
                  onBlur={(e) =>
                    num(e.target.value) !== b.daily_total &&
                    save(b, { daily_total: num(e.target.value) })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                Per month
                <input
                  className="field !min-h-9 !py-1 text-sm"
                  inputMode="numeric"
                  defaultValue={b.monthly_total ?? ''}
                  onBlur={(e) =>
                    num(e.target.value) !== b.monthly_total &&
                    save(b, { monthly_total: num(e.target.value) })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                Each person (by tier)
                <input
                  className="field !min-h-9 !py-1 text-sm"
                  defaultValue={b.per_tier.join(',')}
                  onBlur={(e) => {
                    const tiers = e.target.value
                      .split(',')
                      .map((x) => Math.max(0, Math.round(Number(x)) || 0))
                    if (tiers.length === 5 && tiers.join(',') !== b.per_tier.join(','))
                      save(b, { per_tier: tiers })
                  }}
                />
              </label>
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** #89 Weekly automatic backups (private bucket, newest 8 kept). */
function BackupsCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [files, setFiles] = useState<{ name: string; size: number }[] | null>(
    demo ? [{ name: 'crumbs-2026-10-19.json.gz', size: 182_000 }] : null,
  )
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (demo) return
    const { data } = await supabase.storage.from(BACKUP_BUCKET).list('', { limit: 20 })
    setFiles(
      (data ?? [])
        .filter((f: any) => f.name.endsWith('.json.gz'))
        .map((f: any) => ({ name: f.name, size: f.metadata?.size ?? 0 }))
        .sort((a: any, b: any) => b.name.localeCompare(a.name)),
    )
  }, [demo, supabase])
  useEffect(() => {
    load()
  }, [load])
  async function now() {
    if (demo) return toast('Backups need the real database')
    setBusy(true)
    try {
      const response = await fetch('/api/backup', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Backup failed')
      toast.success(`Saved ${body.saved} (${Math.round(body.bytes / 1024)} KB, ${body.rows} rows)`)
      load()
    } catch (error: any) {
      toast.error(error?.message || 'Backup failed')
    } finally {
      setBusy(false)
    }
  }
  async function download(name: string) {
    const { data, error } = await supabase.storage.from(BACKUP_BUCKET).createSignedUrl(name, 300)
    if (error) return toast.error(error.message)
    window.open(data.signedUrl, '_blank')
  }
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Backups</h3>
      <p className="text-sm text-muted-foreground">
        Every Monday all Crumbs tables are saved as one compressed file (newest 8 kept). Needs
        SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET in Vercel. Photos and sign-in accounts aren’t in
        it.
      </p>
      {files?.length ? (
        files.map((f) => (
          <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {f.name.replace('crumbs-', '').replace('.json.gz', '')}
              <span className="text-muted-foreground">
                {' '}
                · {Math.max(1, Math.round(f.size / 1024))} KB
              </span>
            </span>
            <button className="text-xs text-primary underline" onClick={() => download(f.name)}>
              Download
            </button>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No backups yet.</p>
      )}
      <button className="secondary !min-h-10 text-sm" disabled={busy} onClick={now}>
        {busy ? 'Backing up…' : 'Back up now'}
      </button>
    </section>
  )
}

const POINT_FIELDS: { key: Exclude<keyof PointRules, 'tiers' | 'day_caps'>; label: string }[] = [
  { key: 'window_days', label: 'Points last (days)' },
  { key: 'detail', label: 'New detail' },
  { key: 'confirm', label: 'Confirm (first few)' },
  { key: 'backed', label: 'Backed up (once)' },
  { key: 'menu_set', label: 'Menu dishes per step' },
  { key: 'menu_try', label: 'Per step added' },
  { key: 'menu_ok', label: 'Per step confirmed' },
  { key: 'menu_queue', label: 'Menu queue (dishes)' },
]

/** What earns points and the tier thresholds — tune so it stays worth it for Crumbs. */
function PointsCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [rules, setRules] = useState<PointRules | null>(demo ? POINTS : null)
  useEffect(() => {
    if (demo) return
    supabase
      .from('point_rules')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }: any) => data && setRules(data))
  }, [demo, supabase])
  if (!rules) return null
  async function save(next: PointRules) {
    setRules(next)
    if (demo) return
    const { error } = await supabase.rpc('set_point_rules', { rules: next })
    if (error) toast.error(error.message)
    else toast.success('Points saved')
  }
  const int = (v: string) => Math.max(0, Math.round(Number(v)) || 0)
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Points</h3>
      <p className="text-sm text-muted-foreground">
        Only new info earns points, with no daily cap — points expire instead, so tiers have to be
        kept up. Tiers decide the per-person allowances in the Spending guard.
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {POINT_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            {f.label}
            <input
              className="field !min-h-9 !py-1 text-sm"
              inputMode="numeric"
              defaultValue={rules[f.key]}
              onBlur={(e) =>
                int(e.target.value) !== rules[f.key] &&
                save({ ...rules, [f.key]: int(e.target.value) })
              }
            />
          </label>
        ))}
        <label className="col-span-2 flex flex-col gap-1">
          Tiers (Regular, Local guide, Insider, Legend)
          <input
            className="field !min-h-9 !py-1 text-sm"
            defaultValue={rules.tiers.join(',')}
            onBlur={(e) => {
              const tiers = e.target.value.split(',').map(int)
              if (tiers.length === 4 && tiers.join(',') !== rules.tiers.join(','))
                save({ ...rules, tiers })
            }}
          />
        </label>
        {(
          [
            ['fact', 'Details a day by tier'],
            ['vote', 'Dish checks a day by tier'],
            ['price', 'Price fixes a day by tier'],
            ['groups', 'Groups someone can own at once by tier'],
          ] as const
        ).map(([key, label]) => {
          const caps: DayCaps = { ...DAY_CAPS, ...(rules.day_caps ?? {}) }
          return (
            <label key={key} className="col-span-2 flex flex-col gap-1">
              {label} (Taster → Legend, blank = unlimited)
              <input
                className="field !min-h-9 !py-1 text-sm"
                defaultValue={caps[key].map((n) => (n == null ? '' : n)).join(',')}
                onBlur={(e) => {
                  const parts = e.target.value
                    .split(',')
                    .map((v) => (v.trim() === '' ? null : int(v)))
                  if (parts.length === 5 && parts.join(',') !== caps[key].join(','))
                    save({ ...rules, day_caps: { ...caps, [key]: parts } })
                }}
              />
            </label>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        People whose details others mostly don’t back up (under 30%) get Taster’s limits whatever
        their tier. Admins and Builders have none.
      </p>
    </section>
  )
}

type Person = {
  id: string
  display_name: string
  email: string | null
  is_builder: boolean
  is_admin: boolean
  points: number
  groups: number
}
const DEMO_PEOPLE: Person[] = [
  {
    id: 'demo-maya',
    display_name: 'Maya',
    email: 'maya@example.com',
    is_builder: true,
    is_admin: false,
    points: 140,
    groups: 1,
  },
  {
    id: 'demo-sam',
    display_name: 'Sam',
    email: 'sam@example.com',
    is_builder: false,
    is_admin: false,
    points: 12,
    groups: 2,
  },
]

/**
 * Builders: people you trust to build Crumbs' restaurant data. Their answers count straight away
 * (everyone else's need a second person to agree), no daily limits, any number of groups.
 */
function BuildersCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Person[] | null>(demo ? DEMO_PEOPLE : null)
  async function search(text = q) {
    if (demo)
      return setPeople(
        DEMO_PEOPLE.filter((p) => p.display_name.toLowerCase().includes(text.toLowerCase())),
      )
    const { data, error } = await supabase.rpc('admin_people', { q: text.trim() })
    if (error) return toast.error(error.message)
    setPeople(data ?? [])
  }
  useEffect(() => {
    if (!demo) search('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo])
  async function toggle(p: Person) {
    const next = !p.is_builder
    if (!demo) {
      const { error } = await supabase.rpc('set_builder', { person: p.id, builder: next })
      if (error) return toast.error(error.message)
    }
    setPeople((all) => all?.map((x) => (x.id === p.id ? { ...x, is_builder: next } : x)) ?? null)
    toast.success(
      next ? `${p.display_name} is now a Builder` : `${p.display_name} is no longer a Builder`,
    )
  }
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Builders</h3>
      <p className="text-sm text-muted-foreground">
        People you trust to build the data. Their details, Good to know answers and prices count
        straight away (everyone else’s need a second person to agree). No daily limits, any number
        of groups. Admins already count as Builders.
      </p>
      <div className="flex gap-2">
        <input
          className="field"
          aria-label="Find a person"
          placeholder="Name or email"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && search()}
        />
        <button className="secondary shrink-0" onClick={() => search()}>
          Find
        </button>
      </div>
      {people?.map((p) => (
        <div key={p.id} className="settings-row">
          <span className="min-w-0">
            <span className="block font-semibold">
              {p.display_name} {p.is_admin && <span className="tag ml-1">admin</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {p.email ?? '—'} · {p.points} pts · {p.groups} group{p.groups === 1 ? '' : 's'}
            </span>
          </span>
          <Switch
            label={`${p.display_name} is a Builder`}
            checked={p.is_builder || p.is_admin}
            disabled={p.is_admin}
            onChange={() => toggle(p)}
          />
        </div>
      ))}
    </section>
  )
}

type Claim = {
  id: string
  user_id: string
  restaurant_id: string
  status: 'pending' | 'approved' | 'rejected'
  contact_name: string
  role: string | null
  email: string | null
  phone: string | null
  proof: string | null
  created_at: string
  restaurants: { name: string; formatted_address: string | null; website: string | null } | null
}

/** #100 Restaurant claims waiting for a check (call or email the restaurant, then approve). */
function ClaimsCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [all, setAll] = useState<Claim[]>([])
  useEffect(() => {
    if (demo) return
    supabase
      .from('restaurant_claims')
      .select(
        'id,user_id,restaurant_id,status,contact_name,role,email,phone,proof,created_at,restaurants(name,formatted_address,website)',
      )
      .in('status', ['pending', 'approved'])
      .order('created_at')
      .then(({ data }: any) => setAll(data ?? []))
  }, [demo, supabase])
  const claims = all.filter((c) => c.status === 'pending')
  const owners = all.filter((c) => c.status === 'approved')
  if (!all.length) return null
  async function review(id: string, approve: boolean) {
    const { error } = await supabase.rpc('review_claim', { claim: id, approve })
    if (error) return toast.error(error.message)
    setAll((current) =>
      approve
        ? current.map((c) => (c.id === id ? { ...c, status: 'approved' } : c))
        : current.filter((c) => c.id !== id),
    )
    toast.success(approve ? 'Approved — the page is now Verified by Owner' : 'Claim declined')
  }
  async function removeOwner(c: Claim) {
    if (
      !window.confirm(
        `Remove ${c.contact_name} as owner of ${c.restaurants?.name ?? 'this restaurant'}?`,
      )
    )
      return
    const { error } = await supabase.rpc('remove_manager', {
      target: c.restaurant_id,
      uid: c.user_id,
    })
    if (error) return toast.error(error.message)
    setAll((current) => current.filter((x) => x.id !== c.id))
    toast.success('Owner removed')
  }
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Restaurant claims ({claims.length})</h3>
      {owners.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-primary">
            Verified owners ({owners.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {owners.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{c.restaurants?.name ?? 'Restaurant'}</strong> · {c.contact_name}
                </span>
                <button className="text-xs text-primary underline" onClick={() => removeOwner(c)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      <p className="text-sm text-muted-foreground">
        Check before approving: email at the restaurant’s own website, or call the restaurant’s
        listed number.
      </p>
      {claims.map((c) => (
        <div key={c.id} className="surface-soft flex flex-col gap-1 text-sm">
          <p className="font-semibold">{c.restaurants?.name ?? 'Restaurant'}</p>
          <p className="text-xs text-muted-foreground">
            {c.restaurants?.formatted_address}
            {c.restaurants?.website ? ` · ${c.restaurants.website}` : ''}
          </p>
          <p>
            {c.contact_name}
            {c.role ? ` (${c.role})` : ''} · {[c.email, c.phone].filter(Boolean).join(' · ')}
          </p>
          {c.proof && <p className="text-xs text-muted-foreground">“{c.proof}”</p>}
          <div className="flex gap-2">
            <button
              className="secondary !min-h-9 flex-1 text-sm"
              onClick={() => review(c.id, false)}
            >
              Decline
            </button>
            <button className="primary !min-h-9 flex-1 text-sm" onClick={() => review(c.id, true)}>
              Approve
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

type AdminAlert = {
  id: number
  kind: string
  level: 'info' | 'warn' | 'stop'
  message: string
  day: string
}
type Dupe = {
  a: string
  a_name: string
  a_places: number
  a_owner: boolean
  b: string
  b_name: string
  b_places: number
  b_owner: boolean
  meters: number
}
type Contributor = {
  user_id: string
  name: string | null
  facts: number
  votes: number
  flags: number
  trust: number | null
}

const demoQuality = {
  alerts: [
    {
      id: 1,
      kind: 'pace_ai',
      level: 'info' as const,
      message: 'AI ideas: on pace for ~3,400 this month (limit 3,000). It stops at the limit.',
      day: new Date().toISOString().slice(0, 10),
    },
  ],
  dupes: [
    {
      a: 'r1',
      a_name: 'Hana Ramen',
      a_places: 3,
      a_owner: false,
      b: 'r2',
      b_name: 'Hana Ramen Bar',
      b_places: 1,
      b_owner: false,
      meters: 40,
    },
  ],
  people: [
    { user_id: 'u1', name: 'Sam', facts: 12, votes: 30, flags: 1, trust: 0.92 },
    { user_id: 'u2', name: 'New account', facts: 55, votes: 4, flags: 20, trust: 0.2 },
  ],
}

/** #172 alerts from the daily job, #169 duplicate restaurants to merge, #171 who's busy today. */
function QualityCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [alerts, setAlerts] = useState<AdminAlert[]>(demo ? demoQuality.alerts : [])
  const [dupes, setDupes] = useState<Dupe[]>(demo ? demoQuality.dupes : [])
  const [people, setPeople] = useState<Contributor[]>(demo ? demoQuality.people : [])
  useEffect(() => {
    if (demo) return
    supabase
      .from('admin_alerts')
      .select('id,kind,level,message,day')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }: any) => setAlerts(data ?? []))
    supabase.rpc('possible_duplicates').then(({ data }: any) => setDupes(data ?? []))
    supabase.rpc('recent_contributors').then(({ data }: any) => setPeople(data ?? []))
  }, [demo, supabase])

  async function dismiss(id: number) {
    setAlerts((all) => all.filter((a) => a.id !== id))
    if (!demo) await supabase.from('admin_alerts').delete().eq('id', id)
  }
  async function merge(d: Dupe) {
    // Keep the owner-verified one, else the one more groups saved.
    const keepA = d.a_owner || (!d.b_owner && d.a_places >= d.b_places)
    const [keep, dupe, keepName, dupeName] = keepA
      ? [d.a, d.b, d.a_name, d.b_name]
      : [d.b, d.a, d.b_name, d.a_name]
    if (
      !window.confirm(
        `Merge “${dupeName}” into “${keepName}”? Saved places, menus and details move over.`,
      )
    )
      return
    if (!demo) {
      const { error } = await supabase.rpc('merge_restaurants', { keep, dupe })
      if (error) return toast.error(error.message)
    }
    haptic('success')
    setDupes((all) => all.filter((x) => x !== d))
    toast.success('Merged')
  }

  const busy = people.filter((p) => p.facts + p.votes > 0)
  if (!alerts.length && !dupes.length && !busy.length) return null
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Data quality</h3>
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`surface-soft flex items-start justify-between gap-2 text-sm ${a.level === 'info' ? '' : 'font-semibold'}`}
        >
          <span>
            {a.level === 'stop' ? '🛑 ' : a.level === 'warn' ? '⚠️ ' : ''}
            {a.message}
            <span className="block text-xs font-normal text-muted-foreground">{a.day}</span>
          </span>
          <button className="text-xs text-primary underline" onClick={() => dismiss(a.id)}>
            Dismiss
          </button>
        </div>
      ))}
      {dupes.length > 0 && (
        <details open={dupes.length <= 3}>
          <summary className="cursor-pointer text-sm font-semibold text-primary">
            Possible duplicates ({dupes.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {dupes.map((d) => (
              <div
                key={`${d.a}-${d.b}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0">
                  <strong>{d.a_name}</strong> ({d.a_places}) · <strong>{d.b_name}</strong> (
                  {d.b_places})
                  <span className="block text-xs text-muted-foreground">~{d.meters} m apart</span>
                </span>
                <button className="secondary !min-h-9 shrink-0 text-sm" onClick={() => merge(d)}>
                  Merge
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      {busy.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-primary">
            Busy in the last day ({busy.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {busy.slice(0, 15).map((p) => (
              <div key={p.user_id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{p.name || 'Someone'}</span>
                <span
                  className={`shrink-0 text-xs ${p.trust !== null && p.trust < 0.3 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
                >
                  {p.facts} details · {p.votes} checks{p.flags ? ` · ${p.flags} flags` : ''} ·{' '}
                  {p.trust === null ? 'new' : `${Math.round(p.trust * 100)}% backed`}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Below 30% backed, someone’s details wait for two others to agree. Daily caps: 60
            details, 200 checks, 60 prices.
          </p>
        </details>
      )}
    </section>
  )
}

/** #214 Menu PDFs waiting to be read (end of month with leftover AI allowance, or now). */
function MenuQueueCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(
    demo ? { queued: 3, read: 12 } : null,
  )
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (demo) return
    const { data } = await supabase.from('restaurant_menu_files').select('status')
    if (!data) return
    const out: Record<string, number> = {}
    for (const row of data) out[row.status] = (out[row.status] ?? 0) + 1
    setCounts(out)
  }, [demo, supabase])
  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])
  if (!counts || !Object.keys(counts).length) return null
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Menu PDFs</h3>
      <p className="text-sm text-muted-foreground">
        {counts.queued ?? 0} waiting · {counts.read ?? 0} read
        {counts.failed ? ` · ${counts.failed} couldn’t be read` : ''}. They’re read in the last 3
        days of each month with the AI allowance that’s left.
      </p>
      <button
        className="secondary"
        disabled={busy || !counts.queued || demo}
        onClick={async () => {
          setBusy(true)
          const response = await fetch('/api/menu-queue', { method: 'POST' })
          const result = await response.json().catch(() => ({}))
          setBusy(false)
          if (!response.ok) return toast.error(result.error || 'Could not read them')
          toast.success(`Read ${result.read} (${result.left} AI uses were left this month)`)
          load()
        }}
      >
        {busy ? 'Reading…' : 'Read a few now'}
      </button>
    </section>
  )
}
