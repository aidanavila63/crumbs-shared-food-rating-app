'use client'
// O11 (Round 95): "Let the restaurant know we're coming" on a plan (opt-in). The owner sees only
// the day, time and how many — never who or which group. Only for restaurants their owner runs on
// Crumbs.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Plan } from '@/hooks/use-decide'
import { Switch } from './switch'

export function PlanHeadsUp({ plan, restaurantId, supabase, demo }: { plan: Plan; restaurantId: string | null | undefined; supabase: any; demo: boolean }) {
  const [on, setOn] = useState<boolean | null>(demo ? false : null)
  const [now] = useState(() => Date.now())
  const future = !!plan.starts_at && new Date(plan.starts_at).getTime() > now
  useEffect(() => {
    if (demo || !restaurantId || !future) return
    let live = true
    Promise.resolve(supabase.from('plan_headsups').select('plan_id').eq('plan_id', plan.id).maybeSingle())
      .then(({ data, error }: any) => live && !error && setOn(!!data))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [demo, supabase, plan.id, restaurantId, future])
  if (!restaurantId || !future || on === null) return null
  async function set(next: boolean) {
    if (demo) return toast('Not available in demo mode')
    const before = on
    setOn(next)
    const { error } = await supabase.rpc('plan_headsup', { target_plan: plan.id, send: next })
    if (error) {
      setOn(before)
      toast.error(/plan_headsup|schema cache|PGRST202/i.test(error.message ?? '') ? 'This isn’t switched on yet' : error.message)
      return
    }
    toast.success(next ? 'The restaurant can see a group is coming (not who)' : 'Heads-up taken back')
  }
  return (
    <div className="settings-row !py-1">
      <span className="text-sm">
        <span className="font-semibold">Let the restaurant know we’re coming</span>
        <span className="block text-xs text-muted-foreground">They see the day, time and how many — never who.</span>
      </span>
      <Switch label="Let the restaurant know we’re coming" checked={!!on} onChange={set} />
    </div>
  )
}

/** For the owner: groups planning to come (day, time, how many). */
export function OwnerHeadsUps({ restaurantId, supabase, demo }: { restaurantId: string; supabase: any; demo: boolean }) {
  const [list, setList] = useState<{ starts_at: string; party: number }[] | null>(() =>
    demo ? [{ starts_at: new Date(Date.now() + 2 * 864e5).toISOString(), party: 4 }] : null,
  )
  useEffect(() => {
    if (demo) return
    let live = true
    Promise.resolve(supabase.rpc('owner_headsups', { target: restaurantId }))
      .then(({ data, error }: any) => live && setList(error ? null : (data ?? [])))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [demo, supabase, restaurantId])
  if (!list) return null
  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Coming up</h3>
      {list.length ? (
        list.map((h, i) => (
          <p key={i} className="text-sm">
            🗓{' '}
            {new Date(h.starts_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            {' · '}
            {h.party === 1 ? 'one person' : `a group of ${h.party}`}
          </p>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No heads-ups yet.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Groups planning to come who chose to let you know. Never who — and not a booking.
      </p>
    </section>
  )
}
