'use client'
// #52 What your other groups think of this place, and #47 sharing your rating with them.
// Only groups you're in, and only places they saved too — nothing public. Your notes stay in
// the group you wrote them in; only the scores travel.
// Round 80 (solo-first): "Also save to…" puts the place in another of your spaces (My Crumbs or
// a group) in one tap, with your scores.
import { useEffect, useState } from 'react'
import { oneEmoji } from '@/lib/group-look'
import { toast } from 'sonner'
import type { Group, Place, Profile, Rating } from '@/hooks/use-crumbs-data'
import { average5, formatScore, type Scale } from '@/lib/ratings'
import { haptic } from '@/lib/motion'
import { isPersonal, saveTargets } from '@/lib/spaces'
import { Switch } from './switch'

type Copy = {
  id: string
  group_id: string
  status: Place['status']
  place_ratings: Pick<Rating, 'user_id' | 'score' | 'points'>[]
}

/** The score columns that travel to other groups (never the notes). */
export function shareableRow(rating: Partial<Rating>) {
  const row: Record<string, unknown> = { score: rating.score, points: rating.points ?? null }
  for (const key of ['food', 'service', 'vibe', 'value', 'would_return'] as const)
    if (key in rating) row[key] = (rating as any)[key] ?? null
  return row
}

/** Groups where my score differs from (or is missing next to) the one I just gave. */
export function needsMyRating(
  copies: Copy[],
  userId: string,
  rating: Pick<Rating, 'score' | 'points'>,
) {
  return copies.filter((c) => {
    const mine = c.place_ratings.find((r) => r.user_id === userId)
    return !mine || mine.score !== rating.score || (mine.points ?? null) !== (rating.points ?? null)
  })
}

export function OtherGroups({
  place,
  groups,
  userId,
  profile,
  supabase,
  demo,
  scale,
  rated,
}: {
  place: Place
  groups: Group[]
  userId?: string
  profile?: Profile | null
  supabase: any
  demo: boolean
  scale: Scale
  /** set after you save a rating here (changes each time) */
  rated: { rating: Partial<Rating>; at: number } | null
}) {
  const real = groups.filter((g) => g.id !== place.group_id)
  // Demo: pretend you're also in a work-lunch group that saved the ramen place.
  const others: Group[] =
    demo && !real.length
      ? [
          {
            id: 'demo-work',
            name: 'Work lunch crew',
            emoji: '💼',
            join_code: 'DEMO22',
            created_by: 'x',
          },
        ]
      : real
  const [copies, setCopies] = useState<Copy[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  // Round 81: show this place on your public profile (only once your profile is public)
  const canPick = !demo && !!profile?.profile_public && !!place.restaurant_id && !!userId
  const [picked, setPicked] = useState<boolean | null>(null)
  useEffect(() => {
    if (!canPick) return
    let cancelled = false
    supabase
      .from('profile_picks')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', 'place')
      .eq('restaurant_id', place.restaurant_id)
      .then(({ data, error }: any) => {
        if (!cancelled) setPicked(error ? null : !!data?.length)
      })
    return () => {
      cancelled = true
    }
  }, [canPick, supabase, userId, place.restaurant_id])
  async function setOnProfile(on: boolean) {
    setPicked(on)
    const { error } = await supabase.rpc('toggle_profile_pick', {
      restaurant: place.restaurant_id,
      show: on,
    })
    if (error) {
      setPicked(!on)
      return toast.error(error.message)
    }
    haptic('success')
    toast.success(on ? `On your profile (@${profile?.handle ?? 'you'})` : 'Taken off your profile')
  }
  const [offer, setOffer] = useState<Copy[]>([])
  const mode = profile?.share_ratings ?? 'group'
  const otherIds = others.map((g) => g.id).join(',')

  const nameOf = (id: string) => {
    const g = others.find((x) => x.id === id)
    return g ? `${isPersonal(g) ? '🔒 ' : oneEmoji(g.emoji) ? `${oneEmoji(g.emoji)} ` : ''}${g.name}` : null
  }

  /** Also save to…: copy this place (and your scores) into another of your spaces. */
  async function saveTo(target: Group) {
    if (saving) return
    setSaving(target.id)
    try {
      const mine = place.place_ratings.find((r) => r.user_id === userId)
      let id = `demo-copy-${target.id}`
      let existed = false
      if (!demo) {
        const { data, error } = await supabase.rpc('copy_place', {
          source: place.id,
          target_group: target.id,
        })
        if (error) throw error
        id = data.id
        existed = !!data.existed
      }
      setCopies((all) => [
        ...all.filter((c) => c.id !== id),
        {
          id,
          group_id: target.id,
          status: place.status,
          place_ratings:
            mine && !existed && userId
              ? [{ user_id: userId, score: mine.score, points: mine.points ?? null }]
              : [],
        },
      ])
      haptic('success')
      toast.success(`${existed ? 'Already in' : 'Saved to'} ${nameOf(target.id) ?? target.name}`)
    } catch (error: any) {
      toast.error(
        /copy_place|schema cache|PGRST202/i.test(error?.message ?? '')
          ? 'Saving to another space isn’t switched on yet'
          : error?.message || 'Could not save it there',
      )
    } finally {
      setSaving(null)
    }
  }

  async function share(targets: Copy[], announce = true) {
    if (!rated || !userId) return
    const row = shareableRow(rated.rating)
    const next = copies.map((c) =>
      targets.some((t) => t.id === c.id)
        ? {
            ...c,
            place_ratings: [
              ...c.place_ratings.filter((r) => r.user_id !== userId),
              { user_id: userId, score: row.score as number, points: row.points as number | null },
            ],
          }
        : c,
    )
    setCopies(next)
    setOffer([])
    if (!demo) {
      const { error } = await supabase
        .from('place_ratings')
        .upsert(targets.map((t) => ({ ...row, place_id: t.id, user_id: userId })))
      if (error) return toast.error(error.message)
    }
    if (announce || mode === 'all') {
      haptic('success')
      toast.success(
        `Your rating is in ${targets.length === 1 ? (nameOf(targets[0].group_id) ?? 'your other group') : `${targets.length} other groups`} too`,
      )
    }
  }

  useEffect(() => {
    if (!otherIds) return
    let cancelled = false
    ;(async () => {
      if (demo) {
        if (place.id === 'demo-ramen')
          setCopies([
            {
              id: 'demo-copy',
              group_id: others[0]?.id ?? 'demo-work',
              status: 'Been',
              place_ratings: [
                { user_id: 'x1', score: 4, points: null },
                { user_id: 'x2', score: 5, points: null },
                { user_id: 'x3', score: 4, points: null },
              ],
            },
          ])
        return
      }
      const select = 'id,group_id,status,place_ratings(user_id,score,points)'
      const ids = otherIds.split(',')
      // Same restaurant: same map id, or the same shared restaurant profile.
      const [byKey, byRestaurant] = await Promise.all([
        supabase
          .from('places')
          .select(select)
          .eq('google_place_id', place.google_place_id)
          .in('group_id', ids),
        place.restaurant_id
          ? supabase
              .from('places')
              .select(select)
              .eq('restaurant_id', place.restaurant_id)
              .in('group_id', ids)
          : Promise.resolve({ data: [] }),
      ])
      const seen = new Set<string>()
      const all = [...(byKey.data ?? []), ...(byRestaurant.data ?? [])].filter((c: Copy) =>
        seen.has(c.id) ? false : (seen.add(c.id), true),
      )
      if (!cancelled) {
        setCopies(all)
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, otherIds, demo])

  // #47 After you rate here: copy it to your other groups, or offer to.
  useEffect(() => {
    if (!rated || !userId || !copies.length || mode === 'group' || !rated.rating.score) return
    const targets = needsMyRating(copies, userId, rated.rating as Rating)
    if (!targets.length) return
    if (mode === 'ask') return setOffer(targets)
    share(targets, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rated?.at])

  const targets =
    loaded || demo
      ? saveTargets(
          real,
          place.group_id,
          copies.map((c) => c.group_id),
        )
      : []
  if (!copies.length && !targets.length && picked === null) return null
  const iRated = place.place_ratings.some((r) => r.user_id === userId)
  const hidden = !!profile?.blind_ratings && !iRated

  return (
    <div className="surface-soft flex flex-col gap-2">
      {(copies.length > 0 || targets.length > 0) && (
        <h3 className="font-serif text-xl font-bold">
          {others.some(isPersonal) ? 'Your other spaces' : 'Your other groups'}
        </h3>
      )}
      {copies.map((c) => {
        const avg = average5(c.place_ratings)
        const mine = c.place_ratings.find((r) => r.user_id === userId)
        return (
          <div key={c.id} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-semibold">
              {nameOf(c.group_id) ?? 'Another group'}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {hidden
                ? 'Rate it to see'
                : c.place_ratings.length
                  ? `${formatScore(avg, scale)} from ${c.place_ratings.length}${mine ? ` · you ${formatScore(average5([mine]), scale)}` : ''}`
                  : c.status === 'Want to try'
                    ? 'Want to try'
                    : 'Not rated yet'}
            </span>
          </div>
        )
      })}
      {targets.length > 0 && (
        <div
          className={`flex flex-wrap items-center gap-2 ${copies.length ? 'border-t border-[var(--border)] pt-2' : ''}`}
        >
          <span className="text-sm">Also save to…</span>
          {targets.map((g) => (
            <button
              key={g.id}
              className="chip chip-sm"
              disabled={!!saving}
              aria-busy={saving === g.id}
              onClick={() => saveTo(g)}
            >
              {saving === g.id ? 'Saving…' : (nameOf(g.id) ?? g.name)}
            </button>
          ))}
        </div>
      )}
      {picked !== null && (
        <div
          className={`flex items-center justify-between gap-3 ${copies.length || targets.length ? 'border-t border-[var(--border)] pt-2' : ''}`}
        >
          <span className="text-sm">
            <span className="font-semibold">Show on my public profile</span>
            <span className="block text-muted-foreground">
              Anyone with your profile link (@{profile?.handle}) sees it in your favourites.
            </span>
          </span>
          <Switch label="Show on my public profile" checked={picked} onChange={setOnProfile} />
        </div>
      )}
      {offer.length > 0 && (
        <div className="rise-panel flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2">
          <span className="text-sm">Add your rating there too?</span>
          {offer.map((c) => (
            <button key={c.id} className="chip chip-sm" onClick={() => share([c])}>
              {nameOf(c.group_id) ?? 'Other group'}
            </button>
          ))}
          {offer.length > 1 && (
            <button className="chip chip-sm chip-active" onClick={() => share(offer)}>
              All {offer.length}
            </button>
          )}
          <button className="text-xs text-muted-foreground underline" onClick={() => setOffer([])}>
            No thanks
          </button>
        </div>
      )}
    </div>
  )
}
