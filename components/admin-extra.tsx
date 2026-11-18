'use client'
// Round 77 Admin cards: launch numbers (third pass #17), notice banner + read-only pause (#16),
// last runs of the scheduled jobs + live-updates check (E23, E22), and Photos: unused files and
// small copies for old photos (B10, E6). Each card says so when the Round 77 SQL hasn't run.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { askConfirm } from '@/lib/ask'
import { jobIsLate } from '@/lib/jobs-shared'
import { PHOTO_BUCKET, THUMB_SIZE, shrinkImage } from '@/lib/photos'
import { TURNSTILE_SITE_KEY } from '@/lib/turnstile'
import { Switch } from './switch'
import { timeAgo } from './social'

const NEEDS_SQL = 'Run the newest database updates in Supabase to turn this on (Admin → Database updates lists them).'
const kb = (bytes: number) =>
  bytes > 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

type Week = {
  week: string
  places: number
  ratings: number
  visits: number
  groups: number
  people: number
  active: number
}
type Launch = {
  active_7d: number
  active_30d: number
  people: number
  waiting: number
  waitlist: number
  weeks: Week[]
}

/** Third pass #17: how the launch is going, from the database only (no tracking). */
export function LaunchNumbersCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [data, setData] = useState<Launch | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (demo) {
      setData({
        active_7d: 3,
        active_30d: 5,
        people: 6,
        waiting: 1,
        waitlist: 2,
        weeks: [
          { week: '2026-11-02', places: 12, ratings: 20, visits: 6, groups: 1, people: 2, active: 3 },
          { week: '2026-11-09', places: 8, ratings: 15, visits: 9, groups: 0, people: 1, active: 4 },
        ],
      })
      return
    }
    supabase.rpc('admin_launch_numbers').then(({ data, error }: any) => {
      if (error) setMissing(true)
      else setData(data)
    })
  }, [demo, supabase])
  const max = Math.max(1, ...(data?.weeks ?? []).map((w) => w.places + w.ratings + w.visits))
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Launch numbers</h3>
      {missing && <p className="text-sm text-muted-foreground">{NEEDS_SQL}</p>}
      {!data && !missing && <div className="skeleton h-24" />}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['Active this week', data.active_7d],
                ['Active this month', data.active_30d],
                ['People', data.people],
                ['Waiting for you', data.waiting],
                ['On the waitlist', data.waitlist],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="surface-soft">
                <p className="font-serif text-2xl text-primary">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1" aria-label="Last 8 weeks">
            <p className="text-sm font-semibold">Last 8 weeks (week starting)</p>
            {data.weeks.map((w) => {
              const total = w.places + w.ratings + w.visits
              return (
                <div key={w.week} className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0 text-muted-foreground">
                    {new Date(`${w.week}T12:00:00`).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="owned-bar flex-1" title={`${total} things added`}>
                    <span className="bar-fill" style={{ width: `${(total / max) * 100}%` }} />
                  </span>
                  <span className="w-36 shrink-0 text-right">
                    {w.places} places · {w.ratings} ratings · {w.active} active
                    {w.groups ? ` · ${w.groups} new group${w.groups === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            “Active” = added, rated or logged something. Counts only, no tracking.
          </p>
        </>
      )}
    </section>
  )
}

type Setting = { on?: boolean; text?: string; message?: string; level?: 'info' | 'warn' }

/** Third pass #16: a line at the top of Crumbs for everyone, and a switch that makes it read-only. */
export function NoticeCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [notice, setNotice] = useState<Setting>({})
  const [pause, setPause] = useState<Setting>({})
  const [botCheck, setBotCheck] = useState<Setting>({})
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (demo) return
    supabase
      .from('site_settings')
      .select('key,value')
      .then(({ data, error }: any) => {
        if (error) return setMissing(true)
        for (const row of data ?? []) {
          if (row.key === 'notice') setNotice(row.value ?? {})
          if (row.key === 'pause') setPause(row.value ?? {})
          if (row.key === 'bot_check') setBotCheck(row.value ?? {})
        }
      })
  }, [demo, supabase])
  async function save(key: 'notice' | 'pause' | 'bot_check', value: Setting) {
    if (demo) return toast('Needs the real database')
    setBusy(true)
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(
      key === 'bot_check'
        ? value.on
          ? 'Waitlist sign-ups now go through the bot check only'
          : 'Bot check switched off'
        : key === 'pause'
        ? value.on
          ? 'Crumbs is read-only for everyone but admins'
          : 'Crumbs is open again'
        : value.on
          ? 'Notice is showing'
          : 'Notice hidden',
    )
  }
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Notice and pause</h3>
      {missing ? (
        <p className="text-sm text-muted-foreground">{NEEDS_SQL}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            A short line at the top of Crumbs for everyone (planned work, a known problem). Phones
            pick it up the next time Crumbs opens.
          </p>
          <textarea
            className="field min-h-16"
            maxLength={200}
            placeholder="e.g. Crumbs will be read-only for 10 minutes tonight at 9 pm"
            value={notice.text ?? ''}
            onChange={(event) => setNotice({ ...notice, text: event.target.value })}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notice.level === 'warn'}
                onChange={(event) =>
                  setNotice({ ...notice, level: event.target.checked ? 'warn' : 'info' })
                }
              />
              Amber (a problem)
            </label>
            <div className="flex gap-2">
              {notice.on && (
                <button
                  className="secondary !min-h-10 !px-3 text-sm"
                  disabled={busy}
                  onClick={() => {
                    const next = { ...notice, on: false }
                    setNotice(next)
                    save('notice', next)
                  }}
                >
                  Hide
                </button>
              )}
              <button
                className="primary !min-h-10 !px-3 text-sm"
                disabled={busy || !notice.text?.trim()}
                onClick={() => {
                  const next = { ...notice, text: notice.text?.trim(), on: true }
                  setNotice(next)
                  save('notice', next)
                }}
              >
                {notice.on ? 'Update' : 'Show'}
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-start justify-between gap-3 border-t border-[var(--border)] pt-3">
            <div>
              <p className="text-sm font-semibold">Read-only pause</p>
              <p className="text-xs text-muted-foreground">
                For database work: everyone can still look, but nobody except admins can add,
                change or delete anything in groups until you switch it off.
              </p>
            </div>
            <Switch
              checked={!!pause.on}
              label="Read-only pause"
              onChange={async (on: boolean) => {
                if (
                  on &&
                  !(await askConfirm('Make Crumbs read-only?', {
                    body: 'Everyone except admins will get a message when they try to change something.',
                    confirm: 'Pause',
                  }))
                )
                  return
                const next = { ...pause, on }
                setPause(next)
                save('pause', next)
              }}
            />
          </div>
          {TURNSTILE_SITE_KEY && (
            <div className="mt-2 flex items-start justify-between gap-3 border-t border-[var(--border)] pt-3">
              <div>
                <p className="text-sm font-semibold">Bot check on the waitlist</p>
                <p className="text-xs text-muted-foreground">
                  The form already shows Cloudflare’s check. Switch this on (after one test
                  sign-up works) so nothing can skip it. Needs TURNSTILE_SECRET_KEY and
                  SUPABASE_SERVICE_ROLE_KEY in Vercel.
                </p>
              </div>
              <Switch
                checked={!!botCheck.on}
                label="Bot check on the waitlist"
                onChange={(on: boolean) => {
                  const next = { on }
                  setBotCheck(next)
                  save('bot_check', next)
                }}
              />
            </div>
          )}
          {pause.on && (
            <input
              className="field"
              maxLength={160}
              placeholder="Message people see (optional)"
              value={pause.message ?? ''}
              onChange={(event) => setPause({ ...pause, message: event.target.value })}
              onBlur={() => save('pause', pause)}
            />
          )}
        </>
      )}
    </section>
  )
}

type Run = {
  job: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  detail: Record<string, any>
  last_ok: string | null
}
const JOB_LABEL: Record<string, string> = { daily: 'Daily chores', backup: 'Weekly backup' }

/** E23 + E22: when the scheduled jobs last ran, and whether live updates are on for every table. */
export function JobsCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [live, setLive] = useState<string[] | null>(null)
  const [missing, setMissing] = useState(false)
  const load = useCallback(async () => {
    if (demo) {
      setRuns([])
      setLive([])
      return
    }
    const [r, l] = await Promise.all([
      supabase.rpc('admin_job_runs'),
      supabase.rpc('admin_realtime_tables'),
    ])
    if (r.error) return setMissing(true)
    setRuns(r.data ?? [])
    setLive(l.error ? null : (l.data ?? []))
  }, [demo, supabase])
  useEffect(() => {
    load()
  }, [load])
  return (
    <section className="surface settings-card">
      <div className="flex items-center justify-between">
        <h3 className="settings-heading">Last runs</h3>
        <button className="icon-btn" aria-label="Refresh last runs" onClick={load}>
          <RefreshCw size={18} />
        </button>
      </div>
      {missing && <p className="text-sm text-muted-foreground">{NEEDS_SQL}</p>}
      {runs && (
        <>
          {(['daily', 'backup'] as const).map((job) => {
            const run = runs.find((r) => r.job === job)
            const late = jobIsLate(job, run?.last_ok)
            return (
              <div key={job} className="flex items-start justify-between gap-2 text-sm">
                <span>
                  <span className="font-semibold">{JOB_LABEL[job]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {run
                      ? `${timeAgo(run.started_at)} · ${
                          run.ok === null ? 'still running or cut off' : run.ok ? 'OK' : 'had a problem'
                        }${run.detail?.failed ? ` (${run.detail.failed.join(', ')})` : ''}${
                          run.detail?.error ? ` — ${run.detail.error}` : ''
                        }${run.detail?.r2 ? ` · off-site copy: ${run.detail.r2}` : ''}`
                      : 'No run recorded yet'}
                  </span>
                </span>
                {late && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    {run ? 'Overdue' : 'Not seen'}
                  </span>
                )}
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">
            The daily chores run every morning and the backup on Mondays (Vercel → Settings →
            Cron Jobs). “Overdue” = no good run in 36 hours (daily) or 8½ days (backup): check
            CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY in Vercel.
          </p>
        </>
      )}
      {live && (
        <p className="text-sm">
          {live.length ? (
            <>
              <span className="font-semibold">Live updates are off for:</span> {live.join(', ')}.
              Supabase → Database → Publications → supabase_realtime, or run the Round 77 SQL again.
            </>
          ) : (
            <span className="text-muted-foreground">Live updates are on for every table the app listens to.</span>
          )}
        </p>
      )}
    </section>
  )
}

type PhotoReport = {
  files: number
  bytes: number
  orphans: number
  orphan_bytes: number
  orphan_names: string[]
  no_thumb: number
  no_thumb_names: string[]
}

/** B10 + E6: photo files nothing uses (dry run, then confirm) and small copies for old photos. */
export function PhotosCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [report, setReport] = useState<PhotoReport | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const load = useCallback(async () => {
    if (demo) {
      setReport({
        files: 120,
        bytes: 24_000_000,
        orphans: 3,
        orphan_bytes: 600_000,
        orphan_names: ['demo/a.jpg', 'demo/b.jpg', 'demo/c.jpg'],
        no_thumb: 10,
        no_thumb_names: [],
      })
      return
    }
    const { data, error } = await supabase.rpc('admin_photo_report', { sample: 200 })
    if (error) return setMissing(true)
    setReport(data)
  }, [demo, supabase])

  async function removeUnused() {
    if (!report || demo) return toast('Needs the real database')
    if (
      !(await askConfirm(`Delete ${report.orphan_names.length} unused photo files?`, {
        body: 'Only files nothing in Crumbs points at (checked again before deleting). This can’t be undone.',
        confirm: 'Delete',
        danger: true,
      }))
    )
      return
    setBusy('delete')
    try {
      const response = await fetch('/api/admin-photos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'delete', names: report.orphan_names }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not delete')
      toast.success(`Deleted ${body.removed} file${body.removed === 1 ? '' : 's'}`)
      setShowList(false)
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete')
    } finally {
      setBusy(null)
    }
  }

  async function makeSmallCopies() {
    if (!report || demo) return toast('Needs the real database')
    setBusy('thumbs')
    let made = 0
    let failed = 0
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}`
    for (const name of report.no_thumb_names) {
      try {
        const photo = await fetch(`${base}/${name}`)
        if (!photo.ok) throw new Error('missing')
        const small = await shrinkImage(await photo.blob(), THUMB_SIZE, 0.72)
        const form = new FormData()
        form.append('name', name)
        form.append('file', small, 'small.jpg')
        const saved = await fetch('/api/admin-photos', { method: 'POST', body: form })
        if (!saved.ok) throw new Error('not saved')
        made += 1
      } catch {
        failed += 1
      }
    }
    setBusy(null)
    toast.success(`Made ${made} small cop${made === 1 ? 'y' : 'ies'}${failed ? `, ${failed} failed` : ''}`)
    load()
  }

  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Photos</h3>
      {missing && <p className="text-sm text-muted-foreground">{NEEDS_SQL}</p>}
      {!report && !missing && (
        <button className="secondary !min-h-10 text-sm" onClick={load}>
          Check photo storage
        </button>
      )}
      {report && (
        <>
          <p className="text-sm">
            {report.files} files · {kb(report.bytes)} in Supabase storage. Photos on Cloudflare R2
            aren’t counted here.
          </p>
          <div className="surface-soft flex flex-col gap-2">
            <p className="text-sm">
              <span className="font-semibold">Unused files: {report.orphans}</span>
              {report.orphans ? ` (${kb(report.orphan_bytes)})` : ''}
              <span className="block text-xs text-muted-foreground">
                Left behind by deleted groups, replaced photos or uploads that never finished.
                Anything less than a day old, and anything in Recently deleted, is never counted.
              </span>
            </p>
            {report.orphans > 0 && (
              <>
                <button className="text-left text-xs text-primary underline" onClick={() => setShowList(!showList)}>
                  {showList ? 'Hide the list' : `Show what would go${report.orphans > 200 ? ' (first 200)' : ''}`}
                </button>
                {showList && (
                  <ul className="max-h-48 overflow-auto font-mono text-[11px] text-muted-foreground">
                    {report.orphan_names.map((name) => (
                      <li key={name} className="truncate">
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  className="secondary !min-h-10 text-sm text-destructive"
                  disabled={!!busy}
                  onClick={removeUnused}
                >
                  {busy === 'delete'
                    ? 'Deleting…'
                    : `Delete ${report.orphan_names.length} unused file${report.orphan_names.length === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
          <div className="surface-soft flex flex-col gap-2">
            <p className="text-sm">
              <span className="font-semibold">Photos without a small copy: {report.no_thumb}</span>
              <span className="block text-xs text-muted-foreground">
                Older photos load full-size in lists and grids. Making small copies happens on this
                phone (about a second each); keep Crumbs open until it’s done.
              </span>
            </p>
            {report.no_thumb > 0 && (
              <button className="secondary !min-h-10 text-sm" disabled={!!busy} onClick={makeSmallCopies}>
                {busy === 'thumbs'
                  ? 'Making small copies…'
                  : `Make ${report.no_thumb_names.length} small cop${report.no_thumb_names.length === 1 ? 'y' : 'ies'}`}
              </button>
            )}
          </div>
          <button className="text-xs text-primary underline" onClick={load} disabled={!!busy}>
            Check again
          </button>
        </>
      )}
    </section>
  )
}

type Report = {
  id: string
  restaurant_id: string
  restaurant: string
  detail: string
  sensitive: boolean
  note: string | null
  by: string | null
  created_at: string
}

/** Round 78: reported restaurant details. Diet/allergen ones first: they're hidden until answered. */
export function ReportsCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [missing, setMissing] = useState(false)
  const load = useCallback(async () => {
    if (demo) return setReports([])
    const { data, error } = await supabase.rpc('admin_reports')
    if (error) return setMissing(true)
    setReports(data ?? [])
  }, [demo, supabase])
  useEffect(() => {
    load()
  }, [load])
  async function resolve(report: Report, outcome: 'fixed' | 'dismissed') {
    const { error } = await supabase.rpc('resolve_report', { report: report.id, outcome })
    if (error) return toast.error(error.message)
    setReports((current) => (current ?? []).filter((r) => !(r.restaurant_id === report.restaurant_id && r.detail === report.detail)))
  }
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Reports{reports?.length ? ` (${reports.length})` : ''}</h3>
      {missing && <p className="text-sm text-muted-foreground">{NEEDS_SQL}</p>}
      {reports && !reports.length && <p className="text-sm text-muted-foreground">Nothing reported.</p>}
      {reports?.map((r) => (
        <div key={r.id} className="surface-soft flex flex-col gap-2 text-sm">
          <p>
            {r.sensitive && <span className="mr-1 rounded bg-amber-100 px-1 text-xs text-amber-900">hidden until answered</span>}
            <strong>{r.restaurant}</strong> · {r.detail.replace(/_/g, ' ')}
            {r.note ? ` — “${r.note}”` : ''}
            <span className="block text-xs text-muted-foreground">
              {timeAgo(r.created_at)}
              {r.by ? ` by ${r.by}` : ''}
            </span>
          </p>
          <div className="flex gap-2">
            <button className="secondary !min-h-9 flex-1 text-xs" onClick={() => resolve(r, 'dismissed')}>
              It’s right (show it again)
            </button>
            <button className="primary !min-h-9 flex-1 text-xs" onClick={() => resolve(r, 'fixed')}>
              Fixed it
            </button>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        “Fixed it” means you corrected the detail (or removed it) on the restaurant. Both answers
        close every report on that detail.
      </p>
    </section>
  )
}

/** Round 78: hibernation numbers (nothing is deleted for being quiet). */
export function QuietCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [q, setQ] = useState<{ quiet_people: number; quiet_groups: number; seen_this_week: number } | null>(null)
  useEffect(() => {
    if (demo) return
    supabase.rpc('admin_quiet_groups').then(({ data, error }: any) => !error && setQ(data))
  }, [demo, supabase])
  if (!q) return null
  return (
    <p className="text-sm">
      <strong>{q.seen_this_week}</strong> people opened Crumbs this week. Quiet for 12 months:{' '}
      <strong>{q.quiet_people}</strong> people (their phones’ push keys and error records are
      cleared by the daily job; nothing they wrote is touched) and <strong>{q.quiet_groups}</strong>{' '}
      groups (photo shrinking waits until warning emails can be sent).
    </p>
  )
}

type OvertureNumbers = {
  loaded: number
  waiting: number
  linked: number
  added: number
  skipped: number
  release: string | null
  restaurants: number
}

/** Round 79: the Overture import (scripts/overture/README.md) — load, then merge a batch at a time. */
export function OvertureCard({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [n, setN] = useState<OvertureNumbers | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (demo) return
    const { data, error } = await supabase.rpc('admin_overture')
    if (error) return setMissing(true)
    setN(data)
  }, [demo, supabase])
  useEffect(() => {
    load()
  }, [load])
  async function merge() {
    setBusy(true)
    let total = { linked: 0, added: 0 }
    // Several batches per tap, each a short database call (well under Supabase's time limit).
    for (let i = 0; i < 10; i += 1) {
      const { data, error } = await supabase.rpc('merge_overture', { batch: 1000 })
      if (error) {
        toast.error(error.message)
        break
      }
      total = { linked: total.linked + data.linked, added: total.added + data.added }
      if (!data.waiting) break
    }
    setBusy(false)
    toast.success(`${total.added} new restaurants, ${total.linked} matched to ones Crumbs had`)
    load()
  }
  if (demo) return null
  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Overture (open place data)</h3>
      {missing ? (
        <p className="text-sm text-muted-foreground">{NEEDS_SQL}</p>
      ) : !n ? (
        <div className="skeleton h-16" />
      ) : (
        <>
          <p className="text-sm">
            {n.loaded
              ? `${n.loaded.toLocaleString()} GTA food places loaded${n.release ? ` (release ${n.release})` : ''}: ${n.added.toLocaleString()} added, ${n.linked.toLocaleString()} matched to places Crumbs already had, ${n.waiting.toLocaleString()} waiting.`
              : 'Nothing loaded yet. See scripts/overture/README.md: make the file, load it into overture_places, then merge here.'}{' '}
            Crumbs has {n.restaurants.toLocaleString()} restaurants in all.
          </p>
          {n.waiting > 0 && (
            <button className="primary !min-h-10 text-sm" disabled={busy} onClick={merge}>
              {busy ? 'Merging…' : `Merge the next ${Math.min(n.waiting, 10000).toLocaleString()}`}
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            Merging never replaces a detail members, an owner or a restaurant’s website gave; it only
            fills empty ones. Imported places show in search and nearby, not as pins.
          </p>
        </>
      )}
    </section>
  )
}
