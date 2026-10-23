'use client'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import { useCrumbsData, type Place } from '@/hooks/use-crumbs-data'
import { PlaceCard, placeAverage } from './place-card'
import { PlaceSheet } from './place-sheet'
import { AddPlaceSheet } from './add-place-sheet'
import { WelcomeCard } from './welcome-card'
import { MapTab } from './map-tab'
import { ListsTab } from './lists-tab'
import { ForYouTab } from './for-you-tab'
import { GroupTab } from './group-tab'
import { MapsProvider } from './maps-provider'
import { SurpriseSheet } from './surprise-sheet'
import { notifyMates } from '@/lib/push'
import { GoalsTab } from './goals-tab'
import { TonightCard } from './tonight-card'
import { CravingButton } from './craving-button'
import { HoursRefresher } from './place-hours'
import { maskRatings, mergeMasked } from '@/lib/place-info'

const tabs = ['Places', 'Map', 'Lists', 'Goals', 'For you', 'Group']
export function CrumbsApp() {
  return (
    <MapsProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
      <CrumbsShell />
    </MapsProvider>
  )
}

function CrumbsShell() {
  const data = useCrumbsData()
  const [tab, setTabState] = useState(() =>
    typeof window === 'undefined' ? 'Places' : (sessionStorage.getItem('crumbs-tab') ?? 'Places'),
  )
  function setTab(next: string) {
    setTabState(next)
    sessionStorage.setItem('crumbs-tab', next)
    window.scrollTo({ top: 0 })
  }

  // Hide the tab bar while the keyboard is up so it can't float over the form you're typing in.
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const isText = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' &&
          !['checkbox', 'radio', 'button', 'submit'].includes((el as HTMLInputElement).type)))
    const onIn = (event: FocusEvent) => {
      if (isText(event.target)) {
        clearTimeout(timer)
        setTyping(true)
      }
    }
    const onOut = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setTyping(false), 80)
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const userId = data.user?.id
  const me = data.members.find((member) => member.id === userId) ?? null
  const blind = !!me?.blind_ratings
  // With blind ratings on, everything you look at is a copy with your partner's scores hidden
  // for places and dishes you haven't rated. The real ratings stay in data.places.
  const view = useMemo(() => (blind ? maskRatings(data.places, userId) : data.places), [blind, data.places, userId])
  const selected = view.find((place) => place.id === selectedId) ?? null
  const [home, setHomeState] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('crumbs-home') ?? 'null')
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) setHomeState(saved)
    } catch {}
  }, [])
  function setHome(next: { lat: number; lng: number } | null) {
    setHomeState(next)
    try {
      next ? localStorage.setItem('crumbs-home', JSON.stringify(next)) : localStorage.removeItem('crumbs-home')
    } catch {}
  }
  const [tripMapId, setTripMapId] = useState<string | null>(null)
  const tripList = data.lists.find((list) => list.id === tripMapId) ?? null
  const mapPlaces = useMemo(() => {
    if (!tripList) return view
    const ids = new Set((tripList.list_places ?? []).map((item) => item.place_id))
    return view.filter((place) => ids.has(place.id))
  }, [view, tripList])
  const setSelected = (place: Place | null) => setSelectedId(place?.id ?? null)
  const [sort, setSort] = useState<'Newest' | 'Top rated' | 'A–Z'>('Newest')
  const [adding, setAdding] = useState(false)
  const [surprising, setSurprising] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [groupName, setGroupName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const names = useMemo(
    () => Object.fromEntries(data.members.map((m) => [m.id, m.display_name])),
    [data.members],
  )
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = view.filter((place) => {
      const inFilter =
        filter === 'All' ? true : filter === 'Pinned' ? place.pinned : place.status === filter
      const haystack =
        `${place.name} ${place.formatted_address ?? ''} ${place.cuisine ?? ''} ${(place.tags ?? []).join(' ')}`.toLowerCase()
      return inFilter && haystack.includes(needle)
    })
    if (sort === 'Top rated') return [...list].sort((a, b) => placeAverage(b) - placeAverage(a))
    if (sort === 'A–Z') return [...list].sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [view, filter, query, sort])
  async function magic() {
    setBusy(true)
    const { error } = await data.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${location.origin}/auth/callback`,
      },
    })
    setBusy(false)
    if (error) toast.error(error.message)
    else setSent(true)
  }
  async function createGroup() {
    if (!groupName.trim() || !data.user) return
    setBusy(true)
    const { data: group, error } = await data.supabase.rpc('create_group', {
      group_name: groupName.trim(),
    })
    setBusy(false)
    if (error) return toast.error(error.message)
    data.setGroups([...data.groups, group])
    data.setGroup(group)
    setGroupName('')
    toast.success('Group created')
  }
  async function joinGroup() {
    if (!data.user) return
    setBusy(true)
    const { data: group, error } = await data.supabase.rpc('join_group', { code: joinCode })
    setBusy(false)
    if (error) return toast.error(error.message)
    data.setGroups(
      data.groups.some((item) => item.id === group.id) ? data.groups : [...data.groups, group],
    )
    data.setGroup(group)
    setJoinCode('')
    toast.success('Joined group')
  }
  if (!data.user && data.loading)
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <p className="text-muted-foreground">Loading Crumbs…</p>
      </main>
    )
  if (!data.user)
    return (
      <main className="grid min-h-screen place-items-center bg-background p-5">
        <div className="surface w-full max-w-sm">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Utensils />
            </div>
            <span className="font-serif text-2xl font-bold">crumbs</span>
          </div>
          <h1 className="mt-8 font-serif text-4xl font-bold">Your shared food map</h1>
          <p className="mt-3 leading-6 text-muted-foreground">
            Collect the places and dishes you love together.
          </p>
          {sent ? (
            <div className="mt-7 rounded-2xl bg-muted p-4 text-sm">
              <p>
                Magic link sent to <strong>{email}</strong>. Check your inbox (and spam).
              </p>
              <button className="mt-2 underline" onClick={() => setSent(false)}>
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <input
                aria-label="Email address"
                onKeyDown={(event) => event.key === 'Enter' && email && !busy && magic()}
                className="field mt-7"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button className="primary mt-3 w-full" disabled={!email || busy} onClick={magic}>
                {busy ? 'Sending…' : 'Send magic link'}
              </button>
              <button
                className="secondary mt-3 w-full"
                onClick={async () => {
                  const { error } = await data.supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${location.origin}/auth/callback` },
                  })
                  if (error) toast.error(error.message)
                }}
              >
                Continue with Google
              </button>
            </>
          )}
        </div>
      </main>
    )
  if (!data.groupsLoaded)
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <p className="text-muted-foreground">Loading Crumbs…</p>
      </main>
    )
  if (!data.group)
    return (
      <main className="min-h-screen bg-background p-5">
        <div className="mx-auto flex max-w-xl flex-col gap-4 pt-8">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-serif text-4xl font-bold">Start your food map</h1>
            <button
              className="secondary !min-h-10 !px-3 text-xs"
              onClick={() => data.supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
          <section className="surface">
            <h2 className="font-serif text-2xl font-bold">Create a group</h2>
            <input
              aria-label="Group name"
              onKeyDown={(event) => event.key === 'Enter' && createGroup()}
              className="field mt-4"
              placeholder="Maya & Jordan"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
            />
            <button className="primary mt-3 w-full" disabled={busy} onClick={createGroup}>
              {busy ? 'Creating…' : 'Create group'}
            </button>
          </section>
          <section className="surface">
            <h2 className="font-serif text-2xl font-bold">Join with a code</h2>
            <input
              aria-label="Join code"
              onKeyDown={(event) => event.key === 'Enter' && joinGroup()}
              className="field mt-4 uppercase tracking-widest"
              maxLength={6}
              placeholder="ABC123"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            />
            <button
              className="secondary mt-3 w-full"
              disabled={busy || joinCode.length !== 6}
              onClick={joinGroup}
            >
              Join group
            </button>
          </section>
        </div>
      </main>
    )
  return (
    <main className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Utensils />
            </div>
            <span className="font-serif text-2xl font-bold">crumbs</span>
          </div>
          <button
            className="secondary !min-h-10 !px-3 text-xs"
            onClick={() =>
              data.demo
                ? (data.setUser(null), toast.success('Signed out'))
                : data.supabase.auth.signOut()
            }
          >
            Sign out
          </button>
        </header>
        <div className="mb-5 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Your shared food map</p>
            <h1 className="truncate font-serif text-3xl font-bold">{data.group.name}</h1>
          </div>
          {data.groups.length > 1 && (
            <select
              aria-label="Switch group"
              className="field shrink-0 !w-auto !max-w-[45%] !py-2"
              value={data.group.id}
              onChange={(event) =>
                data.setGroup(
                  data.groups.find((group) => group.id === event.target.value) || data.group,
                )
              }
            >
              {data.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {tab === 'Places' && (
          <section className="flex flex-col gap-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={18}
                />
                <input
                  aria-label="Search places"
                  className="field field-icon"
                  placeholder="Search places"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <button
                className="primary size-12 shrink-0"
                aria-label="Add a place"
                onClick={() => setAdding(true)}
              >
                <Plus />
              </button>
            </div>
            <div className="chip-row">
              {['All', 'Been', 'Want to try', 'Pinned'].map((item) => (
                <button
                  key={item}
                  aria-pressed={filter === item}
                  className={`chip ${filter === item ? 'chip-active' : ''}`}
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            {!data.loading && <TonightCard places={view} members={data.members} onOpen={setSelected} />}
            <div className="flex items-center justify-between gap-2">
              <div className="chip-row min-w-0">
                {(['Newest', 'Top rated', 'A–Z'] as const).map((item) => (
                  <button
                    key={item}
                    aria-pressed={sort === item}
                    className={`chip chip-sm ${sort === item ? 'chip-active' : ''}`}
                    onClick={() => setSort(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <button
                className="secondary !min-h-10 shrink-0 !px-3 text-sm"
                onClick={() => setSurprising(true)}
              >
                🎲 Surprise us
              </button>
            </div>
            <CravingButton groupId={data.group.id} />
            {data.loading ? (
              <div
                className="flex flex-col gap-4"
                aria-busy="true"
                aria-label="Loading your places"
              >
                <div className="skeleton h-28" />
                <div className="skeleton h-28" />
                <div className="skeleton h-28" />
              </div>
            ) : filtered.length ? (
              filtered.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  names={names}
                  members={data.members}
                  home={home}
                  hidden={blind && !place.place_ratings.some((rating) => rating.user_id === userId) && data.places.find((real) => real.id === place.id)!.place_ratings.some((rating) => rating.user_id !== userId)}
                  onSelect={setSelected}
                />
              ))
            ) : (
              <WelcomeCard
                group={data.group}
                hasPlaces={data.places.length > 0}
                onAdd={() => setAdding(true)}
              />
            )}
          </section>
        )}
        {tab === 'Map' && (
          <>
            {tripList && (
              <div className="surface-soft mb-3 flex items-center justify-between gap-3 text-sm">
                <span>
                  ✈️ Showing <strong>{tripList.trip_city || tripList.name}</strong> only
                </span>
                <button className="text-primary underline" onClick={() => setTripMapId(null)}>
                  Show everything
                </button>
              </div>
            )}
          <MapTab
            places={mapPlaces}
            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
            onSelect={setSelected}
          />
          </>
        )}
        {tab === 'Lists' && (
          <ListsTab
            lists={data.lists}
            places={data.places}
            userId={data.user?.id}
            groupId={data.group.id}
            demo={data.demo}
            supabase={data.supabase}
            onLists={data.setLists}
            onShowOnMap={(id) => {
              setTripMapId(id)
              setTab('Map')
            }}
          />
        )}
        {tab === 'Goals' && <GoalsTab places={data.places} />}
        {tab === 'For you' && (
          <ForYouTab
            places={view}
            members={data.members}
            userId={data.user?.id}
            names={names}
            onSelect={setSelected}
          />
        )}
        {tab === 'Group' && (
          <GroupTab
            group={data.group}
            groups={data.groups}
            places={data.places}
            members={data.members}
            profile={data.members.find((m) => m.id === data.user?.id) ?? null}
            userId={data.user?.id}
            supabase={data.supabase}
            demo={data.demo}
            home={home}
            onHome={setHome}
            onProfile={(changes) =>
              data.setMembers((current) =>
                current.map((member) => (member.id === userId ? { ...member, ...changes } : member)),
              )
            }
            onGroup={data.setGroup}
            onLeft={(id) => {
              const rest = data.groups.filter((g) => g.id !== id)
              data.setGroups(rest)
              data.setGroup(rest[0] ?? null)
            }}
            onSignOut={() => (data.demo ? data.setUser(null) : data.supabase.auth.signOut())}
          />
        )}
      </div>
      <nav className={`tab-bar ${typing ? 'tab-bar-hidden' : ''}`} aria-label="Main">
        {tabs.map((item) => (
          <button
            className={tab === item ? 'tab-active' : ''}
            aria-current={tab === item ? 'page' : undefined}
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {surprising && (
        <SurpriseSheet
          places={view}
          members={data.members}
          onClose={() => setSurprising(false)}
          onOpen={(place) => {
            setSurprising(false)
            setSelected(place)
          }}
        />
      )}
      {adding && (
        <AddPlaceSheet
          userId={data.user.id}
          groupId={data.group.id}
          demo={data.demo}
          supabase={data.supabase}
          onClose={() => setAdding(false)}
          onSaved={(place) => {
            data.setPlaces([place, ...data.places])
            notifyMates({ type: 'place_added', placeId: place.id })
          }}
        />
      )}
      {selected && (
        <PlaceSheet
          place={selected}
          userId={data.user.id}
          names={names}
          members={data.members}
          lists={data.lists}
          onLists={data.setLists}
          demo={data.demo}
          supabase={data.supabase}
          onClose={() => setSelected(null)}
          onUpdate={(place) => {
            data.setPlaces(
              data.places.map((item) => (item.id === place.id ? (blind ? mergeMasked(item, place, userId) : place) : item)),
            )
          }}
          onDelete={() => {
            data.setPlaces((current) => current.filter((item) => item.id !== selected.id))
            setSelected(null)
          }}
          onRestore={(restored) =>
            data.setPlaces((current) =>
              current.some((item) => item.id === restored.id) ? current : [restored, ...current],
            )
          }
        />
      )}
      {!data.loading && (
        <HoursRefresher
          places={data.places}
          supabase={data.supabase}
          demo={data.demo}
          onPlace={(id, changes) =>
            data.setPlaces((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
          }
        />
      )}
    </main>
  )
}
