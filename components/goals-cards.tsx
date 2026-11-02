'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { HomeMeal, List, Place } from '@/hooks/use-crumbs-data'
import { passport } from '@/lib/passport'
import {
  GOAL_KINDS,
  goalProgress,
  monthlyChallenges,
  seasonalChallenge,
  visitStreak,
  type GoalKind,
} from '@/lib/goals'
import { haptic, useCountUp } from '@/lib/motion'

/** Your weekly eating-out streak (shown in Profile → Achievements). */
export function StreakCard({ places }: { places: Place[] }) {
  const streak = useMemo(() => visitStreak(places), [places])
  const shown = useCountUp(streak.current)
  return (
    <div className="surface">
      <p className="text-sm text-muted-foreground">Eating-out streak</p>
      <p className="font-serif text-5xl text-primary">
        <span className={streak.current > 0 ? 'streak-flame' : ''} aria-hidden="true">
          🔥
        </span>{' '}
        {shown} <span className="text-2xl">week{streak.current === 1 ? '' : 's'}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {streak.current === 0
          ? 'Log a visit this week to start a streak.'
          : streak.thisWeekDone
            ? 'This week is counted. Nice.'
            : 'Log a visit by Sunday to keep it going.'}{' '}
        Best ever: {streak.best} week{streak.best === 1 ? '' : 's'}.
      </p>
    </div>
  )
}

/** This month's challenges (shown in Decide & Plan). */
export function ChallengesCard({ places }: { places: Place[] }) {
  const challenges = useMemo(
    () => [seasonalChallenge(places), ...monthlyChallenges(places)],
    [places],
  )
  const month = new Date().toLocaleDateString(undefined, { month: 'long' })
  const done = challenges.filter((challenge) => challenge.done >= challenge.target).length
  return (
    <div className="surface flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-2xl font-bold">{month} challenges</h2>
        <span className="text-sm text-muted-foreground">
          {done}/{challenges.length} done
        </span>
      </div>
      {challenges.map((challenge) => {
        const complete = challenge.done >= challenge.target
        return (
          <div key={challenge.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className={complete ? 'font-semibold text-primary' : 'font-semibold'}>
                {complete && <span className="check-pop">✓ </span>}
                {challenge.title}
              </span>
              <span className="text-muted-foreground">
                {challenge.done}/{challenge.target}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={challenge.target}
              aria-valuenow={challenge.done}
              aria-label={challenge.title}
            >
              <div
                className="bar-fill h-full rounded-full bg-primary"
                style={{ width: `${(challenge.done / challenge.target) * 100}%` }}
              />
            </div>
            {challenge.note && <p className="text-xs text-muted-foreground">{challenge.note}</p>}
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground">Challenges reset on the 1st of each month.</p>
    </div>
  )
}

type Goal = { id: string; kind: GoalKind; target: number; year: number }

/** #138 Goals the whole group works on this year ("10 new cuisines"). */
export function GroupGoalsCard({
  groupId,
  places,
  meals,
  supabase,
  demo,
  year,
}: {
  groupId: string
  places: Place[]
  meals: HomeMeal[]
  supabase: any
  demo: boolean
  year: number
}) {
  const [goals, setGoals] = useState<Goal[]>(
    demo ? [{ id: 'demo-goal', kind: 'new_cuisines', target: 10, year }] : [],
  )
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<GoalKind>('new_places')
  const [target, setTarget] = useState('12')
  useEffect(() => {
    if (demo) return
    let cancelled = false
    supabase
      .from('group_goals')
      .select('id,kind,target,year')
      .eq('group_id', groupId)
      .eq('year', year)
      .then(({ data }: any) => !cancelled && setGoals(data ?? []))
    return () => {
      cancelled = true
    }
  }, [demo, groupId, supabase, year])

  async function add() {
    const n = Math.round(Number(target))
    if (!(n >= 1 && n <= 1000)) return toast.error('Pick a number from 1 to 1000')
    const row = { group_id: groupId, kind, target: n, year }
    if (demo)
      setGoals((all) => [
        ...all.filter((g) => g.kind !== kind),
        { id: crypto.randomUUID(), ...row },
      ])
    else {
      const { data, error } = await supabase
        .from('group_goals')
        .upsert(row, { onConflict: 'group_id,kind,year' })
        .select('id,kind,target,year')
        .single()
      if (error) return toast.error(error.message)
      setGoals((all) => [...all.filter((g) => g.kind !== kind), data])
    }
    haptic('success')
    setAdding(false)
  }
  async function remove(goal: Goal) {
    setGoals((all) => all.filter((g) => g.id !== goal.id))
    if (!demo) await supabase.from('group_goals').delete().eq('id', goal.id)
  }

  return (
    <div className="surface flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-2xl font-bold">{year} group goals</h2>
        <button
          className="text-sm font-semibold text-primary underline"
          onClick={() => setAdding(!adding)}
        >
          {adding ? 'Cancel' : '+ Add a goal'}
        </button>
      </div>
      {!goals.length && !adding && (
        <p className="text-sm text-muted-foreground">
          Set something to aim for together this year — like 10 new cuisines.
        </p>
      )}
      {goals.map((goal) => {
        const meta = GOAL_KINDS.find((k) => k.id === goal.kind)!
        const done = goalProgress(goal.kind, places, meals, year)
        const pct = Math.min(100, Math.round((done / goal.target) * 100))
        return (
          <div key={goal.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span
                className={done >= goal.target ? 'font-semibold text-primary' : 'font-semibold'}
              >
                {done >= goal.target ? '🏆 ' : `${meta.emoji} `}
                {meta.label(goal.target)}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {Math.min(done, goal.target)}/{goal.target}
                <button
                  className="text-xs underline"
                  onClick={() => remove(goal)}
                  aria-label="Remove goal"
                >
                  ✕
                </button>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
            >
              <div
                className="bar-fill h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
      {adding && (
        <div className="rise-panel flex flex-col gap-2">
          <div className="chip-row">
            {GOAL_KINDS.map((k) => (
              <button
                key={k.id}
                aria-pressed={kind === k.id}
                className={`chip chip-sm ${kind === k.id ? 'chip-active' : ''}`}
                onClick={() => setKind(k.id)}
              >
                {k.emoji} {k.label(Number(target) || 0).replace(/\d+ /, '')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              className="field"
              style={{ width: 90 }}
              inputMode="numeric"
              aria-label="Target"
              value={target}
              onChange={(event) => setTarget(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <span className="min-w-0 flex-1 text-sm">
              {GOAL_KINDS.find((k) => k.id === kind)!.label(Number(target) || 0)}
            </span>
            <button className="primary !px-4" onClick={add}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** #216 City passport: a stamp for every city you've eaten in. */
export function PassportCard({ places, lists = [] }: { places: Place[]; lists?: List[] }) {
  const stamps = useMemo(() => passport(places, lists), [places, lists])
  if (!stamps.length) return null
  return (
    <div className="surface flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-2xl font-bold">City passport</h2>
        <span className="text-sm text-muted-foreground">
          {stamps.length} cit{stamps.length === 1 ? 'y' : 'ies'}
        </span>
      </div>
      <div className="passport-grid">
        {stamps.map((s, i) => (
          <div
            key={s.city}
            className="passport-stamp"
            style={{ rotate: `${((i * 37) % 13) - 6}deg` }}
          >
            <span className="block font-serif text-lg font-bold leading-tight">{s.city}</span>
            <span className="block text-[0.65rem] uppercase tracking-wide">
              {new Date(`${s.first}T12:00:00`).toLocaleDateString(undefined, {
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <span className="block text-[0.65rem]">
              {s.places} place{s.places === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
