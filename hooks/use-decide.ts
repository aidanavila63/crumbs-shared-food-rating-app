'use client'
// Decide together (#30 swipe to match, #40 vote on a list, #34 occasions) and plans (#48).
// Loaded per group once the v4 database update has run; live updates through realtime.
import { track } from '@/lib/analytics'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

export type SwipeSession = {
  id: string
  group_id: string
  created_by: string
  title: string | null
  list_id: string | null
  place_ids: string[]
  status: 'open' | 'closed'
  created_at: string
}
export type SwipeVote = { session_id: string; place_id: string; user_id: string; yes: boolean }
export type Plan = {
  id: string
  group_id: string
  title: string
  starts_at: string | null
  place_id: string | null
  session_id: string | null
  note: string | null
  created_by: string
  created_at: string
  /** #141 booking details */
  booked_under?: string | null
  booking_ref?: string | null
  party?: number | null
  /** #198 did you go? */
  outcome?: 'went' | 'skipped' | null
}
export type Rsvp = { plan_id: string; user_id: string; answer: 'yes' | 'maybe' | 'no' }

const hoursFromNow = (h: number) => new Date(Date.now() + h * 36e5).toISOString()

function demoState(groupId: string) {
  return {
    sessions: [
      {
        id: 'demo-session',
        group_id: groupId,
        created_by: 'demo-partner',
        title: 'Friday dinner',
        list_id: null,
        place_ids: ['demo-place', 'demo-ramen', 'demo-taco', 'demo-thai'],
        status: 'open' as const,
        created_at: hoursFromNow(-3),
      },
    ],
    votes: [
      { session_id: 'demo-session', place_id: 'demo-place', user_id: 'demo-partner', yes: true },
      { session_id: 'demo-session', place_id: 'demo-ramen', user_id: 'demo-partner', yes: true },
      { session_id: 'demo-session', place_id: 'demo-taco', user_id: 'demo-partner', yes: false },
      { session_id: 'demo-session', place_id: 'demo-thai', user_id: 'demo-partner', yes: true },
    ],
    plans: [
      {
        id: 'demo-plan',
        group_id: groupId,
        title: 'Anniversary dinner',
        starts_at: (() => {
          const d = new Date(Date.now() + 2 * 864e5)
          d.setHours(19, 30, 0, 0)
          return d.toISOString()
        })(),
        place_id: 'demo-place',
        session_id: null,
        note: 'Booked for 7:30, ask for the patio',
        created_by: 'demo-partner',
        created_at: hoursFromNow(-20),
      },
    ],
    rsvps: [{ plan_id: 'demo-plan', user_id: 'demo-partner', answer: 'yes' as const }],
  }
}

export function useDecide({
  groupId,
  userId,
  supabase,
  demo,
  v4,
}: {
  groupId?: string
  userId?: string
  supabase: any
  demo: boolean
  v4: boolean
}) {
  const [sessions, setSessions] = useState<SwipeSession[]>([])
  const [votes, setVotes] = useState<SwipeVote[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [rsvps, setRsvps] = useState<Rsvp[]>([])
  const enabled = !!groupId && (demo || v4)

  const load = useCallback(async () => {
    if (!groupId) return
    if (demo) {
      const d = demoState(groupId)
      setSessions(d.sessions)
      setVotes(d.votes)
      setPlans(d.plans)
      setRsvps(d.rsvps)
      return
    }
    if (!v4) return
    const since = new Date(Date.now() - 30 * 864e5).toISOString()
    const [s, p] = await Promise.all([
      supabase
        .from('swipe_sessions')
        .select('*,swipe_votes(session_id,place_id,user_id,yes)')
        .eq('group_id', groupId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('plans')
        .select('*,plan_rsvps(plan_id,user_id,answer)')
        .eq('group_id', groupId)
        .order('starts_at', { ascending: true, nullsFirst: false })
        .limit(60),
    ])
    if (!s.error) {
      setSessions((s.data ?? []).map((row: any) => ({ ...row, swipe_votes: undefined })))
      setVotes((s.data ?? []).flatMap((row: any) => row.swipe_votes ?? []))
    }
    if (!p.error) {
      setPlans((p.data ?? []).map((row: any) => ({ ...row, plan_rsvps: undefined })))
      setRsvps((p.data ?? []).flatMap((row: any) => row.plan_rsvps ?? []))
    }
  }, [demo, groupId, supabase, v4])

  useEffect(() => {
    if (!enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    if (demo) return
    const channel = supabase
      .channel(`decide-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swipe_sessions', filter: `group_id=eq.${groupId}` },
        load,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swipe_votes' }, load)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plans', filter: `group_id=eq.${groupId}` },
        load,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_rsvps' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [demo, enabled, groupId, load, supabase])

  async function startSession(title: string, placeIds: string[], listId: string | null = null) {
    if (!groupId || !userId) return null
    const row: SwipeSession = {
      id: crypto.randomUUID(),
      group_id: groupId,
      created_by: userId,
      title: title.trim().slice(0, 80) || null,
      list_id: listId,
      place_ids: placeIds.slice(0, 30),
      status: 'open',
      created_at: new Date().toISOString(),
    }
    if (!demo) {
      const { data, error } = await supabase
        .from('swipe_sessions')
        .insert({
          group_id: groupId,
          created_by: userId,
          title: row.title,
          list_id: listId,
          place_ids: row.place_ids,
        })
        .select('*')
        .single()
      if (error) {
        toast.error(error.message)
        return null
      }
      Object.assign(row, data)
    }
    setSessions((current) => [row, ...current])
    track('decide_started', { places: row.place_ids.length })
    return row
  }

  async function vote(sessionId: string, placeId: string, yes: boolean) {
    if (!userId) return
    const row = { session_id: sessionId, place_id: placeId, user_id: userId, yes }
    setVotes((current) => [
      ...current.filter(
        (v) => !(v.session_id === sessionId && v.place_id === placeId && v.user_id === userId),
      ),
      row,
    ])
    if (demo) return
    const { error } = await supabase.from('swipe_votes').upsert(row)
    if (error) toast.error(error.message)
  }

  async function closeSession(sessionId: string, status: 'open' | 'closed' = 'closed') {
    setSessions((current) => current.map((s) => (s.id === sessionId ? { ...s, status } : s)))
    if (demo) return
    const { error } = await supabase.from('swipe_sessions').update({ status }).eq('id', sessionId)
    if (error) toast.error(error.message)
  }

  async function deleteSession(sessionId: string) {
    const before = sessions
    setSessions((current) => current.filter((s) => s.id !== sessionId))
    if (demo) return
    const { error } = await supabase.from('swipe_sessions').delete().eq('id', sessionId)
    if (error) {
      setSessions(before)
      toast.error(error.message)
    }
  }

  async function savePlan(plan: Partial<Plan> & { title: string }) {
    if (!groupId || !userId) return null
    const fields = {
      title: plan.title.trim().slice(0, 80),
      starts_at: plan.starts_at ?? null,
      place_id: plan.place_id ?? null,
      session_id: plan.session_id ?? null,
      note: plan.note?.trim().slice(0, 500) || null,
      booked_under: plan.booked_under?.trim().slice(0, 60) || null,
      booking_ref: plan.booking_ref?.trim().slice(0, 60) || null,
      party: plan.party ?? null,
    }
    if (plan.id) {
      setPlans((current) => current.map((p) => (p.id === plan.id ? { ...p, ...fields } : p)))
      if (!demo) {
        const { error } = await supabase.from('plans').update(fields).eq('id', plan.id)
        if (error) toast.error(error.message)
      }
      return plan.id
    }
    let row: Plan = {
      id: crypto.randomUUID(),
      group_id: groupId,
      created_by: userId,
      created_at: new Date().toISOString(),
      ...fields,
    }
    if (!demo) {
      const { data, error } = await supabase
        .from('plans')
        .insert({ group_id: groupId, created_by: userId, ...fields })
        .select('*')
        .single()
      if (error) {
        toast.error(error.message)
        return null
      }
      row = data
    }
    setPlans((current) => [...current, row])
    track('plan_made', { has_place: !!row.place_id, has_time: !!row.starts_at })
    // The person making the plan is going.
    await answer(row.id, 'yes')
    return row.id
  }

  async function deletePlan(planId: string) {
    const before = plans
    setPlans((current) => current.filter((p) => p.id !== planId))
    if (demo) return
    const { error } = await supabase.from('plans').delete().eq('id', planId)
    if (error) {
      setPlans(before)
      toast.error(error.message)
    }
  }

  /** #198 "Did you go?" */
  async function setOutcome(planId: string, outcome: 'went' | 'skipped') {
    setPlans((current) => current.map((p) => (p.id === planId ? { ...p, outcome } : p)))
    if (demo) return
    const { error } = await supabase.from('plans').update({ outcome }).eq('id', planId)
    if (error) toast.error(error.message)
  }

  async function answer(planId: string, value: Rsvp['answer']) {
    if (!userId) return
    const row = { plan_id: planId, user_id: userId, answer: value }
    setRsvps((current) => [
      ...current.filter((r) => !(r.plan_id === planId && r.user_id === userId)),
      row,
    ])
    if (demo) return
    const { error } = await supabase
      .from('plan_rsvps')
      .upsert({ ...row, updated_at: new Date().toISOString() })
    if (error) toast.error(error.message)
  }

  return {
    enabled,
    sessions,
    votes,
    plans,
    rsvps,
    setOutcome,
    startSession,
    vote,
    closeSession,
    deleteSession,
    savePlan,
    deletePlan,
    answer,
    reload: load,
  }
}

export type DecideStore = ReturnType<typeof useDecide>
