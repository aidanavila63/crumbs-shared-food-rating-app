'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCheck,
  Dices,
  Map as MapIcon,
  Plus,
  Search,
  Users,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCrumbsData, type Place } from '@/hooks/use-crumbs-data'
import { PlaceCard, placeAverage } from './place-card'
import { PlaceSheet } from './place-sheet'
import { AddPlaceSheet } from './add-place-sheet'
import { WelcomeCard } from './welcome-card'
import { MapTab } from './map-tab'
import { ListsTab } from './lists-tab'
import { DecideTab } from './decide-tab'
import { GroupTab } from './group-tab'
import { MapsProvider } from './maps-provider'
import { SurpriseSheet } from './surprise-sheet'
import { notifyMates } from '@/lib/push'
import { HoursRefresher } from './place-hours'
import { maskRatings, mergeMasked } from '@/lib/place-info'
import { haptic, useMotionPrefs } from '@/lib/motion'
import { distanceKm } from '@/lib/stats'
import { useUserLocation } from '@/lib/use-user-location'
import { QuickLogSheet } from './quick-log-sheet'
import { captureJoinCode, clearJoinCode, pendingJoinCode, stripJoinParam } from '@/lib/invite'
import { ProfileButton, ProfileHub, type HubPage } from './profile-hub'

const tabs = [
  { id: 'Places', label: 'Places', icon: UtensilsCrossed },
  { id: 'Map', label: 'Map', icon: MapIcon },
  { id: 'Decide', label: 'Decide & Plan', icon: Dices },
  { id: 'Group', label: 'Group', icon: Users },
] as const
type Tab = (typeof tabs)[number]['id']
// Old tab names (before the Oct 2026 layout) map onto the new ones.
const OLD_TABS: Record<string, Tab> = { Lists: 'Places', Goals: 'Decide', 'For you': 'Decide' }
const tabIndex = (id: Tab) => tabs.findIndex((item) => item.id === id)
export function CrumbsApp() {
  return (
    <MapsProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
      <CrumbsShell />
    </MapsProvider>
  )
}

function CrumbsShell() {
  const data = useCrumbsData()
  useMotionPrefs() // applies the Animations setting to the page
  const [tab, setTabState] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'Places'
    const saved = sessionStorage.getItem('crumbs-tab') ?? 'Places'
    return OLD_TABS[saved] ?? (tabs.some((item) => item.id === saved) ? (saved as Tab) : 'Places')
  })
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const [placesView, setPlacesView] = useState<'places' | 'lists'>(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('crumbs-tab') === 'Lists'
      ? 'lists'
      : 'places',
  )
  const [hub, setHub] = useState<HubPage[]>([])
  function setTab(next: Tab) {
    if (next === tab) return
    haptic('tap')
    setDirection(tabIndex(next) > tabIndex(tab) ? 'right' : 'left')
    setTabState(next)
    sessionStorage.setItem('crumbs-tab', next)
    window.scrollTo({ top: 0 })
  }
  function signOut() {
    setHub([])
    if (data.demo) {
      data.setUser(null)
      toast.success('Signed out')
    } else data.supabase.auth.signOut()
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
  const view = useMemo(
    () => (blind ? maskRatings(data.places, userId) : data.places),
    [blind, data.places, userId],
  )
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
      next
        ? localStorage.setItem('crumbs-home', JSON.stringify(next))
        : localStorage.removeItem('crumbs-home')
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
  const [sort, setSort] = useState<'Newest' | 'Top rated' | 'Nearest' | 'A–Z'>('Newest')
  const [quickLog, setQuickLog] = useState(false)
  // Only asks for location once you pick "Nearest"; falls back to the Home saved in Settings.
  const here = useUserLocation(sort === 'Nearest')
  const origin = here ?? home
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
      // #82: search also looks inside dishes and everyone's notes.
      const haystack = [
        place.name,
        place.formatted_address,
        place.cuisine,
        ...(place.tags ?? []),
        ...place.place_ratings.map((rating) => rating.notes),
        ...(place.dishes ?? []).flatMap((dish) => [
          dish.name,
          ...(dish.tags ?? []),
          ...dish.dish_ratings.map((rating) => rating.notes),
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return inFilter && haystack.includes(needle)
    })
    if (sort === 'Top rated') return [...list].sort((a, b) => placeAverage(b) - placeAverage(a))
    if (sort === 'A–Z') return [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'Nearest' && origin) {
      const km = (place: Place) =>
        place.latitude !== null && place.longitude !== null
          ? distanceKm(origin, { lat: place.latitude, lng: place.longitude })
          : Infinity
      return [...list].sort((a, b) => km(a) - km(b))
    }
    return list
  }, [view, filter, query, sort, origin])
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
  async function joinGroup(code = joinCode) {
    if (!data.user) return
    setBusy(true)
    const { data: group, error } = await data.supabase.rpc('join_group', { code })
    setBusy(false)
    if (error) return toast.error(error.message)
    data.setGroups((current) =>
      current.some((item) => item.id === group.id) ? current : [...current, group],
    )
    data.setGroup(group)
    setJoinCode('')
    haptic('success')
    toast.success(`Joined ${group.name}`)
  }
  // #44 Invite links (…/?join=CODE): remember the code through sign-in, then join automatically.
  const [invite] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    captureJoinCode()
    return pendingJoinCode()
  })
  const joining = useRef(false)
  useEffect(() => {
    // Next's router writes the URL once on start-up, so tidy ?join= just after that.
    const timer = setTimeout(stripJoinParam, 0)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!data.user || !data.groupsLoaded || joining.current) return
    const code = pendingJoinCode()
    if (!code) return
    joining.current = true
    clearJoinCode()
    const existing = data.groups.find((group) => group.join_code === code)
    if (existing) data.setGroup(existing)
    else if (!data.demo) joinGroup(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.user, data.groupsLoaded])
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
          {invite && (
            <p className="tag preview-pop mt-6 w-fit">
              🎉 You’re invited — sign in to join the group
            </p>
          )}
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
              onClick={() => joinGroup()}
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
          <ProfileButton profile={me} onClick={() => setHub(['menu'])} />
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
        <div key={tab} className={`tab-pane tab-from-${direction}`}>
          {tab === 'Places' && (
            <section className="flex flex-col gap-4">
              <div className="segmented" role="tablist" aria-label="Places or lists">
                <span
                  className="segmented-thumb"
                  aria-hidden="true"
                  style={{ transform: placesView === 'lists' ? 'translateX(100%)' : 'none' }}
                />
                {(['places', 'lists'] as const).map((view) => (
                  <button
                    key={view}
                    role="tab"
                    aria-selected={placesView === view}
                    className={placesView === view ? 'segmented-active' : ''}
                    onClick={() => {
                      if (view === placesView) return
                      haptic('tap')
                      setPlacesView(view)
                    }}
                  >
                    {view === 'places' ? 'Places' : 'Lists'}
                  </button>
                ))}
              </div>
              {placesView === 'lists' ? (
                <div className="tab-pane tab-from-right">
                  <ListsTab
                    lists={data.lists}
                    places={view}
                    userId={data.user?.id}
                    groupId={data.group.id}
                    demo={data.demo}
                    supabase={data.supabase}
                    onLists={data.setLists}
                    onShowOnMap={(id) => {
                      setTripMapId(id)
                      setTab('Map')
                    }}
                    onSelect={setSelected}
                  />
                </div>
              ) : (
                <div className="tab-pane tab-from-left flex flex-col gap-4">
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
                      className="secondary !min-h-12 shrink-0 !px-3"
                      aria-label="Quick log a visit"
                      onClick={() => setQuickLog(true)}
                    >
                      <CheckCheck size={20} /> Log
                    </button>
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
                  <div className="chip-row min-w-0">
                    {(['Newest', 'Top rated', 'Nearest', 'A–Z'] as const).map((item) => (
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
                  {sort === 'Nearest' && !origin && (
                    <p className="text-xs text-muted-foreground">
                      Finding you… If location is blocked, set Home in Settings to sort by distance.
                    </p>
                  )}
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
                    <div className="stagger flex flex-col gap-4">
                      {filtered.map((place) => (
                        <PlaceCard
                          key={place.id}
                          place={place}
                          names={names}
                          members={data.members}
                          home={home}
                          hidden={
                            blind &&
                            !place.place_ratings.some((rating) => rating.user_id === userId) &&
                            data.places
                              .find((real) => real.id === place.id)!
                              .place_ratings.some((rating) => rating.user_id !== userId)
                          }
                          onSelect={setSelected}
                        />
                      ))}
                    </div>
                  ) : (
                    <WelcomeCard
                      group={data.group}
                      hasPlaces={data.places.length > 0}
                      onAdd={() => setAdding(true)}
                    />
                  )}
                </div>
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
          {tab === 'Decide' && (
            <DecideTab
              places={view}
              allPlaces={data.places}
              members={data.members}
              names={names}
              groupId={data.group.id}
              loading={data.loading}
              onSelect={setSelected}
              onSurprise={() => setSurprising(true)}
              home={home}
            />
          )}
          {tab === 'Group' && (
            <GroupTab
              group={data.group}
              groups={data.groups}
              places={data.places}
              members={data.members}
              userId={data.user?.id}
              supabase={data.supabase}
              demo={data.demo}
              onGroup={data.setGroup}
              onLeft={(id) => {
                const rest = data.groups.filter((g) => g.id !== id)
                data.setGroups(rest)
                data.setGroup(rest[0] ?? null)
              }}
            />
          )}
        </div>
      </div>
      <nav className={`tab-bar ${typing ? 'tab-bar-hidden' : ''}`} aria-label="Main">
        <span
          className="tab-indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${tabIndex(tab) * 100}%)` }}
        />
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={tab === id ? 'tab-active' : ''}
            aria-current={tab === id ? 'page' : undefined}
            key={id}
            onClick={() => setTab(id)}
          >
            <Icon size={21} strokeWidth={tab === id ? 2.4 : 2} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {hub.length > 0 && (
        <ProfileHub
          pages={hub}
          onPages={setHub}
          profile={me}
          group={data.group}
          places={view}
          allPlaces={data.places}
          members={data.members}
          userId={userId}
          names={names}
          onSelect={(place) => {
            setHub([])
            setSelected(place)
          }}
          settings={{
            userId,
            supabase: data.supabase,
            demo: data.demo,
            home,
            onHome: setHome,
            onProfile: (changes) =>
              data.setMembers((current) =>
                current.map((member) =>
                  member.id === userId ? { ...member, ...changes } : member,
                ),
              ),
            onGroupRenamed: (group) => {
              data.setGroup(group)
              data.setGroups(data.groups.map((item) => (item.id === group.id ? group : item)))
            },
            onSignOut: signOut,
          }}
        />
      )}
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
      {quickLog && (
        <QuickLogSheet
          places={data.places}
          userId={data.user.id}
          demo={data.demo}
          supabase={data.supabase}
          onClose={() => setQuickLog(false)}
          onAddNew={() => {
            setQuickLog(false)
            setAdding(true)
          }}
          onUpdate={(place) =>
            data.setPlaces((current) =>
              current.map((item) => (item.id === place.id ? place : item)),
            )
          }
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
              data.places.map((item) =>
                item.id === place.id ? (blind ? mergeMasked(item, place, userId) : place) : item,
              ),
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
            data.setPlaces((current) =>
              current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
            )
          }
        />
      )}
    </main>
  )
}
