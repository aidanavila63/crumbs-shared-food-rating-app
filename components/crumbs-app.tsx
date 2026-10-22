'use client'
import { useMemo, useState } from 'react'
import { Plus, Search, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import { useCrumbsData, type Group, type Place } from '@/hooks/use-crumbs-data'
import { PlaceCard, placeAverage } from './place-card'
import { PlaceSheet } from './place-sheet'
import { AddPlaceSheet } from './add-place-sheet'
import { WelcomeCard } from './welcome-card'
import { MapTab } from './map-tab'
import { ListsTab } from './lists-tab'
import { ForYouTab } from './for-you-tab'
import { GroupTab } from './group-tab'
import { MapsProvider } from './maps-provider'

const tabs = ['Places', 'Map', 'Lists', 'For you', 'Group']
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = data.places.find((place) => place.id === selectedId) ?? null
  const setSelected = (place: Place | null) => setSelectedId(place?.id ?? null)
  const [sort, setSort] = useState<'Newest' | 'Top rated' | 'A–Z'>('Newest')
  const [adding, setAdding] = useState(false)
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
    const list = data.places.filter((place) => {
      const inFilter =
        filter === 'All' ? true : filter === 'Pinned' ? place.pinned : place.status === filter
      const haystack =
        `${place.name} ${place.formatted_address ?? ''} ${place.cuisine ?? ''} ${(place.tags ?? []).join(' ')}`.toLowerCase()
      return inFilter && haystack.includes(needle)
    })
    if (sort === 'Top rated') return [...list].sort((a, b) => placeAverage(b) - placeAverage(a))
    if (sort === 'A–Z') return [...list].sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [data.places, filter, query, sort])
  function surprise() {
    const pool = data.places.filter((place) => place.status === 'Want to try')
    if (!pool.length) return toast('Nothing on your want-to-try list yet')
    const pick = pool[Math.floor(Math.random() * pool.length)]
    setSelected(pick)
  }
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
          <div>
            <p className="text-sm text-muted-foreground">Your shared food map</p>
            <h1 className="font-serif text-4xl font-bold">{data.group.name}</h1>
          </div>
          <select
            aria-label="Switch group"
            className="field !w-auto !py-2"
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
        </div>
        {tab === 'Places' && (
          <section className="flex flex-col gap-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 text-muted-foreground" size={18} />
                <input
                  aria-label="Search places"
                  className="field pl-11"
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
            <div className="flex items-center justify-between gap-2">
              <div className="chip-row">
                {(['Newest', 'Top rated', 'A–Z'] as const).map((item) => (
                  <button
                    key={item}
                    aria-pressed={sort === item}
                    className={`chip ${sort === item ? 'chip-active' : ''}`}
                    onClick={() => setSort(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <button className="secondary !min-h-10 shrink-0 !px-3 text-sm" onClick={surprise}>
                🎲 Surprise us
              </button>
            </div>
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
                <PlaceCard key={place.id} place={place} names={names} onSelect={setSelected} />
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
          <MapTab
            places={data.places}
            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
            onSelect={setSelected}
          />
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
          />
        )}
        {tab === 'For you' && (
          <ForYouTab places={data.places} names={names} onSelect={setSelected} />
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
      <nav className="tab-bar" aria-label="Main">
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
      {adding && (
        <AddPlaceSheet
          userId={data.user.id}
          groupId={data.group.id}
          demo={data.demo}
          supabase={data.supabase}
          onClose={() => setAdding(false)}
          onSaved={(place) => data.setPlaces([place, ...data.places])}
        />
      )}
      {selected && (
        <PlaceSheet
          place={selected}
          userId={data.user.id}
          names={names}
          lists={data.lists}
          onLists={data.setLists}
          demo={data.demo}
          supabase={data.supabase}
          onClose={() => setSelected(null)}
          onUpdate={(place) => {
            data.setPlaces(data.places.map((item) => (item.id === place.id ? place : item)))
            setSelected(place)
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
    </main>
  )
}
