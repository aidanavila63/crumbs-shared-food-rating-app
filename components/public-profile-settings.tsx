'use client'
// "Public profile" (profile hub → Public profile): private by default. Switch it on, pick a link
// name, a short bio, what to show and your favourites; a stranger with the link sees only that.
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import { Switch } from './switch'
import { handleShapeProblem, suggestHandle, HANDLE_CHANGE_DAYS } from '@/lib/handles'
import { profilePath } from '@/lib/public-page'
import { buildSnapshot, dishCandidates, favouriteCandidates } from '@/lib/profile-snapshot'

type Pick = { kind: 'place' | 'dish'; restaurant_id: string; dish?: string | null }
type Mine = {
  public: boolean
  handle: string | null
  bio: string | null
  show: Record<string, boolean> | null
  can_change_after: string | null
  picks: Pick[]
}
const SHOW: [string, string][] = [
  ['favourites', 'Favourite places'],
  ['dishes', 'Top dishes'],
  ['badges', 'Badges'],
  ['passport', 'Passport'],
  ['map', 'Food map of the places I pick'],
]
const MAX_PICKS = 12

export function PublicProfileSettings({
  supabase,
  demo,
  userId,
  profile,
  places,
}: {
  supabase: any
  demo: boolean
  userId?: string
  profile: Profile | null
  places: Place[]
}) {
  const [loaded, setLoaded] = useState(false)
  const [mine, setMine] = useState<Mine | null>(null)
  const [on, setOn] = useState(false)
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [show, setShow] = useState<Record<string, boolean>>({
    favourites: true,
    dishes: true,
    badges: true,
    passport: true,
    map: false,
  })
  const [placePicks, setPlacePicks] = useState<string[]>([])
  const [dishPicks, setDishPicks] = useState<string[]>([]) // "restaurant_id|dish name"
  const [check, setCheck] = useState<{ handle: string; ok: boolean; reason?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      if (demo) {
        setLoaded(true)
        return
      }
      const { data } = await supabase.rpc('my_public_profile')
      if (!live) return
      const row = data as Mine | null
      if (row) {
        setMine(row)
        setOn(!!row.public)
        setHandle(row.handle ?? '')
        setBio(row.bio ?? '')
        if (row.show) setShow((s) => ({ ...s, ...row.show }))
        setPlacePicks(row.picks.filter((p) => p.kind === 'place').map((p) => p.restaurant_id))
        setDishPicks(
          row.picks.filter((p) => p.kind === 'dish').map((p) => `${p.restaurant_id}|${p.dish}`),
        )
      }
      setLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [supabase, demo])

  // Live "is this name OK?" — the phone checks the shape, the database checks everything else.
  const typed = handle.trim().toLowerCase()
  const shape = typed ? handleShapeProblem(typed) : null
  const asked = useRef('')
  useEffect(() => {
    if (!on || !typed || shape || demo) return
    if (mine?.handle && mine.handle.toLowerCase() === typed) return
    const timer = setTimeout(async () => {
      asked.current = typed
      const { data } = await supabase.rpc('handle_check', { h: typed })
      if (asked.current === typed && data)
        setCheck({ handle: typed, ok: !!(data as any).ok, reason: (data as any).reason })
    }, 400)
    return () => clearTimeout(timer)
  }, [typed, shape, on, supabase, demo, mine?.handle])

  const favourites = useMemo(() => favouriteCandidates(places, userId), [places, userId])
  const dishes = useMemo(() => dishCandidates(places, userId).slice(0, 30), [places, userId])
  const locked =
    !!mine?.handle && !!mine.can_change_after && new Date(mine.can_change_after) > new Date()
  const own = !!mine?.handle && mine.handle.toLowerCase() === typed
  const problem = shape ?? (check && check.handle === typed && !check.ok ? check.reason : null)
  const good = !!typed && !shape && (own || (check?.handle === typed && check.ok))

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : list.length < MAX_PICKS ? [...list, key] : list)

  async function save() {
    if (demo) return toast('Public profiles need the real database, not demo mode')
    setSaving(true)
    try {
      if (!on) {
        const { error } = await supabase.rpc('set_public_profile', {
          p_on: false, p_handle: null, p_bio: null, p_show: null, p_snapshot: null, p_picks: null,
        })
        if (error) throw error
        toast.success('Your profile is private again')
      } else {
        const picks: Pick[] = [
          ...placePicks.map((id) => ({ kind: 'place' as const, restaurant_id: id })),
          ...dishPicks.map((k) => {
            const [restaurant_id, ...rest] = k.split('|')
            return { kind: 'dish' as const, restaurant_id, dish: rest.join('|') }
          }),
        ]
        const { data, error } = await supabase.rpc('set_public_profile', {
          p_on: true,
          p_handle: typed,
          p_bio: bio.trim() || null,
          p_show: show,
          p_snapshot: buildSnapshot(places, userId),
          p_picks: picks,
        })
        if (error) throw error
        toast.success(`Saved — crumbs…${profilePath((data as any).handle)}`)
      }
      const { data: fresh } = await supabase.rpc('my_public_profile')
      if (fresh) setMine(fresh as Mine)
    } catch (error: any) {
      toast.error(error?.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    const url = `${location.origin}${profilePath(typed)}`
    try {
      if (navigator.share) await navigator.share({ title: `${profile?.display_name} on Crumbs`, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied')
      }
    } catch {}
  }

  if (!loaded) return <p className="text-muted-foreground">Loading…</p>
  const row = 'flex items-center justify-between gap-3 py-2'
  return (
    <div className="stagger flex flex-col gap-4">
      <section className="surface">
        <div className={row}>
          <div>
            <p className="font-serif text-lg font-bold">Public profile</p>
            <p className="text-sm text-muted-foreground">
              Off by default. When it&apos;s on, anyone with your link can see what you choose below —
              never your email, groups or other people&apos;s ratings.
            </p>
          </div>
          <Switch
            checked={on}
            label="Public profile"
            onChange={(next) => {
              setOn(next)
              if (next && !handle) setHandle(suggestHandle(profile?.display_name))
            }}
          />
        </div>
      </section>

      {on && (
        <>
          <section className="surface flex flex-col gap-2">
            <label className="font-serif text-lg font-bold" htmlFor="pp-handle">
              Your link
            </label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">@</span>
              <input
                id="pp-handle"
                className="field"
                value={handle}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={locked && !!mine?.handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
              />
            </div>
            <p className={`text-sm ${problem ? 'text-destructive' : good ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
              {problem ?? (good ? (own ? 'This is your link' : 'Available') : '3–20 letters, numbers, _ or a single dot. Starts with a letter.')}
            </p>
            <p className="text-xs text-muted-foreground">
              {locked
                ? `You can change it again on ${new Date(mine!.can_change_after!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`
                : `You can change it once every ${HANDLE_CHANGE_DAYS} days. Your old name is held for you for 90 days.`}
            </p>
            {typed && !shape && (
              <p className="break-all text-xs text-muted-foreground">crumbs…{profilePath(typed)}</p>
            )}
          </section>

          <section className="surface flex flex-col gap-2">
            <label className="font-serif text-lg font-bold" htmlFor="pp-bio">
              Short bio
            </label>
            <textarea
              id="pp-bio"
              className="field min-h-20"
              value={bio}
              maxLength={160}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Soup first, everything else second."
            />
            <p className="text-right text-xs text-muted-foreground">{bio.length}/160</p>
          </section>

          <section className="surface">
            <p className="font-serif text-lg font-bold">What to show</p>
            {SHOW.map(([key, label]) => (
              <div key={key} className={row}>
                <span>{label}</span>
                <Switch checked={!!show[key]} label={label} onChange={(v) => setShow({ ...show, [key]: v })} />
              </div>
            ))}
          </section>

          {(show.favourites || show.map) && (
            <section className="surface">
              <p className="font-serif text-lg font-bold">
                Favourite places <span className="text-sm font-normal text-muted-foreground">({placePicks.length}/{MAX_PICKS})</span>
              </p>
              <p className="mb-2 text-sm text-muted-foreground">Places you&apos;ve rated. Only the ones you tick are shown.</p>
              {favourites.length === 0 && <p className="text-sm text-muted-foreground">Rate a few places first.</p>}
              <ul className="flex flex-col">
                {favourites.slice(0, 40).map(({ place, score }) => (
                  <li key={place.id}>
                    <label className="flex items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--primary)]"
                        checked={placePicks.includes(place.restaurant_id!)}
                        onChange={() => toggle(placePicks, setPlacePicks, place.restaurant_id!)}
                      />
                      <span className="flex-1">{place.name}</span>
                      <span className="text-sm text-muted-foreground">{score ? score.toFixed(1) : ''}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {show.dishes && (
            <section className="surface">
              <p className="font-serif text-lg font-bold">
                Top dishes <span className="text-sm font-normal text-muted-foreground">({dishPicks.length}/{MAX_PICKS})</span>
              </p>
              {dishes.length === 0 && <p className="text-sm text-muted-foreground">Rate a few dishes first.</p>}
              <ul className="flex flex-col">
                {dishes.map(({ place, dish }) => {
                  const key = `${place.restaurant_id}|${dish.name}`
                  return (
                    <li key={dish.id}>
                      <label className="flex items-center gap-3 py-2">
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--primary)]"
                          checked={dishPicks.includes(key)}
                          onChange={() => toggle(dishPicks, setDishPicks, key)}
                        />
                        <span className="flex-1">
                          {dish.name} <span className="text-sm text-muted-foreground">· {place.name}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="primary flex-1"
          disabled={saving || (on && (!typed || !!problem))}
          onClick={save}
        >
          {saving ? 'Saving…' : on ? 'Save public profile' : mine?.public ? 'Make it private' : 'Save'}
        </button>
        {mine?.public && on && (
          <button type="button" className="secondary" onClick={copy}>
            Share
          </button>
        )}
      </div>
      {mine?.public && on && (
        <a className="text-center text-sm font-semibold text-primary underline" href={profilePath(mine.handle ?? typed)} target="_blank" rel="noopener noreferrer">
          See how it looks to others
        </a>
      )}
    </div>
  )
}
