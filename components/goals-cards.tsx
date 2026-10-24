'use client'
import { useMemo } from 'react'
import type { Place } from '@/hooks/use-crumbs-data'
import { monthlyChallenges, visitStreak } from '@/lib/goals'
import { useCountUp } from '@/lib/motion'

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
  const challenges = useMemo(() => monthlyChallenges(places), [places])
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
