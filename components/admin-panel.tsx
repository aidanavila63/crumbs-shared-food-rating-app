'use client'
// #21 Admin page (only for accounts with profiles.is_admin): usage counts (#111), feedback inbox
// (#108), feature flags (#109), error log (#110) and the waitlist (#94).
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Trash2 } from 'lucide-react'
import { haptic } from '@/lib/motion'
import { timeAgo } from './social'
import { analyticsOn } from '@/lib/analytics'

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
  const [newFlag, setNewFlag] = useState('')
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
              hint="Move photos to Cloudflare R2 (10 GB free, no download fees) when this passes ~80%."
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
                {stats.facts ?? 0} facts added by members so far.
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

      <section className="surface settings-card">
        <h3 className="settings-heading">Feature switches</h3>
        <p className="text-sm text-muted-foreground">
          <strong>Admin</strong> = only you can see it (e.g. AI features while credits last).
          <strong> Everyone</strong> = all groups. A switch that isn’t listed stays as it is today.
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
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const key = newFlag
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, '_')
              .slice(0, 40)
            if (!key) return
            setFlag(key, 'admin')
            setNewFlag('')
          }}
        >
          <input
            className="field font-mono"
            aria-label="New switch name"
            placeholder="new_switch_name"
            value={newFlag}
            onChange={(event) => setNewFlag(event.target.value)}
          />
          <button className="secondary shrink-0" disabled={!newFlag.trim()}>
            Add
          </button>
        </form>
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
