'use client'
// U17 (Round 93): "Not sure when?" — offer up to 6 days/times on a plan, everyone taps the ones
// that work, whoever made the plan picks one (it becomes the plan's time and the poll closes).
import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { Plan } from '@/hooks/use-decide'
import type { Profile } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { pollSummary, pollTime, type PollOption } from '@/lib/day-poll'

const MAX = 6
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function DayPoll({
  plan,
  supabase,
  demo,
  userId,
  members,
  names,
  onPick,
}: {
  plan: Plan
  supabase: any
  demo: boolean
  userId?: string
  members: Profile[]
  names: Record<string, string>
  onPick: (startsAt: string) => Promise<unknown>
}) {
  const [options, setOptions] = useState<PollOption[] | null>(demo ? [] : null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [missing, setMissing] = useState(false)
  const load = useCallback(async () => {
    if (demo) return
    const { data, error } = await supabase
      .from('plan_options')
      .select('id,starts_at,plan_votes(user_id)')
      .eq('plan_id', plan.id)
    if (error) return setMissing(true)
    setOptions((data ?? []).map((o: any) => ({ id: o.id, starts_at: o.starts_at, votes: (o.plan_votes ?? []).map((v: any) => v.user_id) })))
  }, [demo, supabase, plan.id])
  useEffect(() => {
    Promise.resolve().then(load)
    const again = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [load])

  if (missing || options === null) return null
  const { sorted, favourite } = pollSummary(options)
  const mine = (o: PollOption) => !!userId && o.votes.includes(userId)
  const planner = plan.created_by === userId
  const who = (id: string) => (id === userId ? 'you' : (names[id] ?? members.find((m) => m.id === id)?.display_name ?? 'someone').split(' ')[0])

  async function addDay() {
    const iso = pollTime(draft)
    if (!iso) return toast('Pick a day and time that hasn’t passed')
    if (options!.some((o) => o.starts_at === iso)) return toast('That one’s already there')
    if (demo) {
      setOptions([...(options ?? []), { id: `demo-${Date.now()}`, starts_at: iso, votes: [] }])
      setDraft('')
      return
    }
    const { error } = await supabase.from('plan_options').insert({ plan_id: plan.id, starts_at: iso })
    if (error) return toast.error(error.code === '42501' ? `Up to ${MAX} days` : error.message)
    setDraft('')
    load()
  }
  async function toggle(o: PollOption) {
    if (!userId) return
    haptic('select')
    const on = !mine(o)
    setOptions((all) =>
      (all ?? []).map((x) => (x.id === o.id ? { ...x, votes: on ? [...x.votes, userId] : x.votes.filter((v) => v !== userId) } : x)),
    )
    if (demo) return
    const { error } = on
      ? await supabase.from('plan_votes').insert({ option_id: o.id })
      : await supabase.from('plan_votes').delete().eq('option_id', o.id).eq('user_id', userId)
    if (error && error.code !== '23505') {
      toast.error(error.message)
      load()
    }
  }
  async function pick(o: PollOption) {
    await onPick(o.starts_at)
    if (!demo) await supabase.from('plan_options').delete().eq('plan_id', plan.id)
    setOptions([])
    haptic('success')
    toast.success(`It’s ${when(o.starts_at)}`)
  }

  if (!sorted.length && plan.starts_at && !adding) return null
  return (
    <div className="surface-soft flex flex-col gap-2">
      {sorted.length > 0 ? (
        <>
          <p className="text-sm font-semibold">Which days work? Tap all that do.</p>
          {sorted.map((o) => (
            <div key={o.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <button
                  className={`chip flex-1 justify-between ${mine(o) ? 'chip-active' : ''}`}
                  aria-pressed={mine(o)}
                  onClick={() => toggle(o)}
                >
                  <span>
                    {mine(o) && <Check size={14} className="mr-1 inline" />}
                    {when(o.starts_at)}
                  </span>
                  <span>
                    {o.votes.length}
                    {o.id === favourite ? ' ★' : ''}
                  </span>
                </button>
                {planner && (
                  <button className="text-xs font-semibold text-primary underline" onClick={() => pick(o)}>
                    Pick
                  </button>
                )}
              </div>
              {o.votes.length > 0 && (
                <p className="pl-2 text-xs text-muted-foreground">{o.votes.map(who).join(', ')}</p>
              )}
            </div>
          ))}
          {!planner && <p className="text-xs text-muted-foreground">{who(plan.created_by)} picks the day.</p>}
        </>
      ) : !adding ? (
        <button className="secondary !min-h-10 text-sm" onClick={() => setAdding(true)}>
          <CalendarDays size={16} /> Not sure when? Offer some days
        </button>
      ) : null}
      {(adding || sorted.length > 0) && sorted.length < MAX && (
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            className="field min-w-0 flex-1"
            aria-label="A day and time to offer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="secondary !min-h-11 shrink-0 !px-3 text-sm" onClick={addDay} disabled={!draft}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}
