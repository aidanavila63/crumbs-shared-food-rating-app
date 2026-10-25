'use client'
import { identify, resetAnalytics, track } from '@/lib/analytics'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { SocialContext, useSocialStore } from '@/hooks/use-social'
import { ScaleContext } from './score-input'
import { HomeTab } from './home-tab'
import { useFlags } from '@/hooks/use-flags'
import { useDecide } from '@/hooks/use-decide'
import { installErrorReporter } from '@/lib/report-errors'
import { flushQueue } from '@/lib/offline-queue'
import { addFoundPlace } from '@/lib/add-found'
import { fromShare } from '@/lib/maps-link'
import { inArea } from '@/lib/decide-more'
import { catchUpSeen, isNewMember } from '@/lib/catch-up'
import { CatchUpCard } from './catch-up-card'
import { DraftsReview } from './drafts-review'
import { Walkthrough } from './guidebook'
import { tourDone } from '@/lib/guidebook'
import { searchAll } from '@/lib/search-all'
import { settingsOf } from '@/lib/ratings'

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
  const social = useSocialStore({
    groupId: data.group?.id,
    userId: data.user?.id,
    supabase: data.supabase,
    demo: data.demo,
    v4: data.v4,
  })
  const decide = useDecide({
    groupId: data.group?.id,
    userId: data.user?.id,
    supabase: data.supabase,
    demo: data.demo,
    v4: data.v4,
  })
  const isAdmin = !!data.members.find((member) => member.id === data.user?.id)?.is_admin
  const flag = useFlags({ supabase: data.supabase, demo: data.demo, v4: data.v4, isAdmin })
  // #107 Anonymous usage counts (only when a PostHog key is set).
  useEffect(() => {
    if (data.demo || !data.user?.id || !data.group) return
    identify(data.user.id, { group_size: data.members.length, v4: data.v4 })
    track('app_open')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.user?.id, data.group?.id])
  // #75 Send Quick logs that were saved offline, now and whenever the signal comes back.
  useEffect(() => {
    const uid = data.user?.id
    if (data.demo || !uid) return
    const sync = async () => {
      const sent = await flushQueue(data.supabase, uid)
      if (!sent) return
      toast.success(`Synced ${sent} saved log${sent === 1 ? '' : 's'}`)
      data.load().catch(() => {})
    }
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.demo, data.user?.id, data.supabase])
  // #110 Send a few browser errors to the admin error log (only once the table exists).
  useEffect(() => {
    if (data.demo || !data.v4 || !data.user?.id) return
    return installErrorReporter(data.supabase, data.user.id)
  }, [data.demo, data.v4, data.user?.id, data.supabase])
  useMotionPrefs() // applies the Animations setting to the page
  // Start on Places (same as the server render), then go back to the tab you were on.
  const [tab, setTabState] = useState<Tab>('Places')
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const [placesView, setPlacesView] = useState<'places' | 'lists' | 'home'>('places')
  useLayoutEffect(() => {
    let saved = 'Places'
    try {
      saved = sessionStorage.getItem('crumbs-tab') ?? 'Places'
    } catch {}
    const next =
      OLD_TABS[saved] ?? (tabs.some((item) => item.id === saved) ? (saved as Tab) : 'Places')
    if (next !== 'Places') setTabState(next)
    if (saved === 'Lists') setPlacesView('lists')
  }, [])
  const [hub, setHub] = useState<HubPage[]>([])
  function setTab(next: Tab) {
    if (next === tab) return
    haptic('tap')
    setDirection(tabIndex(next) > tabIndex(tab) ? 'right' : 'left')
    setTabState(next)
    track('tab', { tab: next })
    sessionStorage.setItem('crumbs-tab', next)
    window.scrollTo({ top: 0 })
  }
  function signOut() {
    resetAnalytics()
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
  // #193 All my groups on one read-only map
  const [allGroups, setAllGroups] = useState(false)
  const [otherPlaces, setOtherPlaces] = useState<Place[]>([])
  useEffect(() => {
    if (!allGroups || !data.group || data.demo) return
    const others = data.groups.filter((g) => g.id !== data.group!.id)
    if (!others.length) return
    let cancelled = false
    data.supabase
      .from('places')
      .select('*,place_ratings(*)')
      .in(
        'group_id',
        others.map((g) => g.id),
      )
      .then(({ data: rows }: any) => {
        if (cancelled) return
        setOtherPlaces(
          (rows ?? []).map((p: Place) => {
            const g = others.find((x) => x.id === p.group_id)
            return { ...p, name: `${g?.emoji ?? '👥'} ${p.name}` }
          }),
        )
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups, data.group?.id, data.groups.length])
  const mapPlaces = useMemo(() => {
    if (!tripList) {
      if (!allGroups) return view
      const here = new Set(view.map((p) => p.google_place_id))
      return [...view, ...otherPlaces.filter((p) => !here.has(p.google_place_id))]
    }
    const ids = new Set((tripList.list_places ?? []).map((item) => item.place_id))
    return view.filter((place) => ids.has(place.id))
  }, [view, tripList, allGroups, otherPlaces])
  // #26 A crawl shown on the map gets a walking line through its stops, in order.
  const crawl = useMemo(() => {
    if (tripList?.kind !== 'crawl') return { route: [], labels: {} }
    const stops = [...(tripList.list_places ?? [])]
      .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))
      .map((item) => data.places.find((p) => p.id === item.place_id))
      .filter((p): p is Place => !!p)
    return {
      route: stops
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => ({ lat: p.latitude!, lng: p.longitude! })),
      labels: Object.fromEntries(stops.map((p, i) => [p.id, `${i + 1}`])) as Record<string, string>,
    }
  }, [tripList, data.places])
  const setSelected = (place: Place | null) => setSelectedId(place?.id ?? null)
  const [sort, setSort] = useState<'Newest' | 'Top rated' | 'Nearest' | 'A–Z'>('Newest')
  const [quickLog, setQuickLog] = useState(false)
  // Only asks for location once you pick "Nearest"; falls back to the Home saved in Settings.
  const here = useUserLocation(sort === 'Nearest')
  const origin = here ?? home
  const [adding, setAdding] = useState(false)
  // #163/#164 Home-screen shortcuts (?do=log, ?do=add) and things shared to Crumbs (?title=&text=&url=).
  const [shared, setShared] = useState<{ link: string | null; name: string | null } | null>(null)
  const launched = useRef(false)
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
  // #168 the welcome tour, once per phone (skippable; replay from Settings → Guidebook)
  const [touring, setTouring] = useState(false)
  useEffect(() => {
    if (!data.group || data.demo || data.loading || tourDone()) return
    const timer = setTimeout(() => setTouring(true), 600)
    return () => clearTimeout(timer)
  }, [data.group, data.demo, data.loading])
  // #190 catch-up card for someone who just joined (dismissed per group on this phone)
  const [catchUpSeenNow, setCatchUpSeen] = useState(false)
  const catchUp =
    !!data.group &&
    !catchUpSeenNow &&
    isNewMember(me) &&
    data.places.length >= 3 &&
    !catchUpSeen(data.group.id)
  // #225 search everything
  const found = useMemo(
    () =>
      searchAll(query, {
        places: data.places,
        lists: data.lists,
        meals: data.homeMeals,
        plans: decide?.plans ?? [],
      }),
    [query, data.places, data.lists, data.homeMeals, decide?.plans],
  )
  // #128 a saved area to filter the list by
  const [areaName, setAreaName] = useState<string | null>(null)
  const area = (me?.areas ?? []).find((a) => a.name === areaName) ?? null
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = view.filter((place) => {
      if (area && !inArea(place, area)) return false
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
  }, [view, filter, query, sort, origin, area])
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
  useEffect(() => {
    if (!data.user || !data.group || data.loading || launched.current || typeof window === 'undefined')
      return
    launched.current = true
    const params = new URLSearchParams(window.location.search)
    const action = params.get('do')
    const incoming = fromShare(params)
    // #212 scanned a restaurant's "Find us on Crumbs" poster: add it (or open it if it's saved)
    const addId = params.get('add')
    if (addId && /^[0-9a-f-]{36}$/i.test(addId)) {
      params.delete('add')
      const rest = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
      const saved = data.places.find((p) => p.restaurant_id === addId)
      if (saved) {
        setSelected(saved)
        return
      }
      if (data.demo) return
      ;(async () => {
        const { data: r } = await data.supabase
          .from('restaurants')
          .select('id,source_key,name,formatted_address,latitude,longitude,cuisine,website,google_maps_url')
          .eq('id', addId)
          .maybeSingle()
        if (!r || r.latitude === null) return toast.error('Couldn’t find that restaurant')
        try {
          const place = await addFoundPlace({
            supabase: data.supabase,
            demo: data.demo,
            groupId: data.group!.id,
            userId: data.user!.id,
            found: {
              google_place_id: r.source_key,
              name: r.name,
              formatted_address: r.formatted_address,
              latitude: r.latitude,
              longitude: r.longitude,
              cuisine: r.cuisine,
              website: r.website,
              google_maps_url: r.google_maps_url,
            },
          })
          data.setPlaces((current) => [place, ...current])
          toast.success(`${r.name} is on your Want to try list`)
          setSelected(place)
        } catch (error: any) {
          toast.error(error?.message || 'Could not add it')
        }
      })()
      return
    }
    if (action === 'log') setQuickLog(true)
    else if (action === 'add' || incoming.link || incoming.name) {
      setShared(incoming.link || incoming.name ? incoming : null)
      setAdding(true)
    } else return
    for (const key of ['do', 'title', 'text', 'url']) params.delete(key)
    const rest = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.user, data.group, data.loading])
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
            Collect the places and dishes you love together.{' '}
            {!invite && (
              <a href="/welcome" className="font-semibold text-primary underline">
                What is Crumbs?
              </a>
            )}
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
  // Food crawls (#26) live in Decide & Plan, not in the Lists view.
  const plainLists = data.lists.filter((list) => list.kind !== 'crawl')
  const setPlainLists = (next: typeof data.lists) =>
    data.setLists([...next, ...data.lists.filter((list) => list.kind === 'crawl')])
  // #77 Home cooking sits next to Places and Lists (a group can switch it off).
  const views = (
    settingsOf(data.group).home ? ['places', 'lists', 'home'] : ['places', 'lists']
  ) as ('places' | 'lists' | 'home')[]
  return (
    <SocialContext.Provider value={social}>
    <ScaleContext.Provider value={data.v4 ? settingsOf(data.group).scale : '5'}>
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
            <h1 className="flex min-w-0 items-center gap-2 font-serif text-3xl font-bold">
              {data.group.emoji && (
                <span
                  className="group-badge"
                  style={{ background: data.group.color ?? undefined }}
                  aria-hidden="true"
                >
                  {data.group.emoji}
                </span>
              )}
              <span className="truncate">{data.group.name}</span>
            </h1>
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
        {touring && <Walkthrough onDone={() => setTouring(false)} />}
        {data.offlineCopy && (
          <p className="next-time-note mb-4 text-sm">
            📴 No signal — showing the copy saved on this phone (
            {new Date(data.offlineCopy).toLocaleString(undefined, {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
            ). Changes you make are kept as drafts to review when you’re back.
          </p>
        )}
        {!data.demo && <DraftsReview supabase={data.supabase} onApplied={() => data.load().catch(() => {})} />}
        {me?.role === 'guest' && (
          <p className="next-time-note mb-4 text-sm">
            👀 You’re a guest in {data.group.name} — look around as much as you like. To add or
            rate places, ask them to make you a member.
          </p>
        )}
        {catchUp && (
          <CatchUpCard
            group={data.group}
            places={data.places}
            lists={data.lists}
            onSelect={setSelected}
            onDone={() => setCatchUpSeen(true)}
          />
        )}
        <div key={tab} className={`tab-pane tab-from-${direction}`}>
          {tab === 'Places' && (
            <section className="flex flex-col gap-4">
              <div
                className={`segmented ${views.length === 3 ? 'segmented-3' : ''}`}
                role="tablist"
                aria-label="Places, lists or home cooking"
              >
                <span
                  className="segmented-thumb"
                  aria-hidden="true"
                  style={{ transform: `translateX(${Math.max(0, views.indexOf(placesView)) * 100}%)` }}
                />
                {views.map((view) => (
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
                    {view === 'places' ? 'Places' : view === 'lists' ? 'Lists' : 'Home'}
                  </button>
                ))}
              </div>
              {placesView === 'home' && views.includes('home') ? (
                <div className="tab-pane tab-from-right">
                  <HomeTab
                    meals={data.homeMeals}
                    setMeals={data.setHomeMeals}
                    groupId={data.group.id}
                    userId={userId}
                    names={names}
                    members={data.members}
                    supabase={data.supabase}
                    demo={data.demo}
                    v4={data.v4}
                    places={data.places}
                  />
                </div>
              ) : placesView === 'lists' ? (
                <div className="tab-pane tab-from-right">
                  <ListsTab
                    lists={plainLists}
                    places={view}
                    userId={data.user?.id}
                    groupId={data.group.id}
                    demo={data.demo}
                    supabase={data.supabase}
                    onLists={setPlainLists}
                    onShowOnMap={(id) => {
                      setTripMapId(id)
                      setTab('Map')
                    }}
                    onSelect={setSelected}
                    trips={settingsOf(data.group).trips}
                    groups={data.groups}
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
                  {found && (
                    // #225 everything else that matches, grouped (places are the list below)
                    <div className="surface-soft rise-panel flex flex-col gap-2 text-sm">
                      {found.dishes.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Dishes
                          </p>
                          {found.dishes.map(({ dish, place }) => (
                            <button key={dish.id} className="text-left" onClick={() => setSelected(place)}>
                              <strong>{dish.name}</strong>{' '}
                              <span className="text-muted-foreground">at {place.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {found.lists.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Lists
                          </p>
                          {found.lists.map((l) => (
                            <button key={l.id} className="text-left" onClick={() => setPlacesView('lists')}>
                              {l.emoji} <strong>{l.name}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                      {found.plans.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Plans
                          </p>
                          {found.plans.map((p) => (
                            <button key={p.id} className="text-left" onClick={() => setTab('Decide')}>
                              📅 <strong>{p.title}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                      {found.meals.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Home cooking
                          </p>
                          {found.meals.map((m) => (
                            <button key={m.id} className="text-left" onClick={() => setPlacesView('home')}>
                              🍳 <strong>{m.name}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
                  {(me?.areas?.length ?? 0) > 0 && (
                    <div className="chip-row min-w-0" aria-label="Saved areas">
                      {me!.areas!.map((a) => (
                        <button
                          key={a.name}
                          aria-pressed={areaName === a.name}
                          className={`chip chip-sm ${areaName === a.name ? 'chip-active' : ''}`}
                          onClick={() => setAreaName(areaName === a.name ? null : a.name)}
                        >
                          📍 {a.name}
                        </button>
                      ))}
                    </div>
                  )}
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
                    {tripList.kind === 'crawl' ? '🚶' : '✈️'} Showing <strong>{tripList.trip_city || tripList.name}</strong> only
                  </span>
                  <button className="text-primary underline" onClick={() => setTripMapId(null)}>
                    Show everything
                  </button>
                </div>
              )}
              {data.groups.length > 1 && !tripList && (
                <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {allGroups ? 'Showing places from all your groups' : 'Showing this group'}
                  </span>
                  <button
                    className={`chip chip-sm ${allGroups ? 'chip-active' : ''}`}
                    aria-pressed={allGroups}
                    onClick={() => setAllGroups(!allGroups)}
                  >
                    👥 All my groups
                  </button>
                </div>
              )}
              <MapTab
                places={mapPlaces}
                apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                onSelect={(place) => {
                  if (place.group_id === data.group?.id) return setSelected(place)
                  const g = data.groups.find((x) => x.id === place.group_id)
                  toast(`${place.name.replace(/^\S+\s/, '')} is in ${g?.name ?? 'another group'}`, {
                    action: g ? { label: 'Switch', onClick: () => data.setGroup(g) } : undefined,
                  })
                }}
                route={crawl.route}
                labels={crawl.labels}
                demo={data.demo}
                onAddFound={async (spot) => {
                  try {
                    const place = await addFoundPlace({
                      supabase: data.supabase,
                      demo: data.demo,
                      groupId: data.group!.id,
                      userId: data.user!.id,
                      found: spot,
                    })
                    data.setPlaces((current) => [place, ...current])
                    haptic('success')
                    track('explore_added')
                    toast.success(`${spot.name} added to Want to try`)
                    return true
                  } catch (error: any) {
                    toast.error(error?.message || 'Could not add that place')
                    return false
                  }
                }}
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
              onWrapped={() => setHub(['menu', 'wrapped'])}
              home={home}
              meals={data.homeMeals}
              userId={userId}
              turns={data.v4 && settingsOf(data.group).turns}
              weather={settingsOf(data.group).weather}
              aiIdeas={flag('ai_ideas')}
              decide={decide}
              lists={data.lists}
              onLists={data.setLists}
              group={data.group}
              supabase={data.supabase}
              demo={data.demo}
              onShowOnMap={(id) => {
                setTripMapId(id)
                setTab('Map')
              }}
              onPlaceAdded={(place) => data.setPlaces((current) => [place, ...current])}
              onPlaceUpdated={(place) =>
                data.setPlaces((current) => current.map((p) => (p.id === place.id ? place : p)))
              }
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
              view={view}
              meals={data.homeMeals}
              names={names}
              onSelect={setSelected}
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
          meals={data.homeMeals}
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
            onGroup: (group) => {
              data.setGroup(group)
              data.setGroups((current) => current.map((item) => (item.id === group.id ? group : item)))
            },
            onSignOut: signOut,
            members: data.members,
            v4: data.v4,
            onReload: () => {
              data.load().catch(() => {})
            },
            places: data.places,
            lists: plainLists,
            onImported: (added, newLists) => {
              if (data.demo) {
                data.setPlaces((current) => [...added, ...current])
                if (newLists.length) setPlainLists([...plainLists, ...newLists])
              } else data.load().catch(() => {})
            },
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
          v4={data.v4}
          scale={data.v4 ? settingsOf(data.group).scale : '5'}
          members={data.members}
          turns={data.v4 && settingsOf(data.group).turns}
          onCookedAtHome={
            views.includes('home')
              ? () => {
                  setQuickLog(false)
                  setPlacesView('home')
                }
              : undefined
          }
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
          shared={shared}
          onClose={() => {
            setAdding(false)
            setShared(null)
          }}
          onSaved={(place) => {
            track('place_added', { status: place.status, source: place.google_place_id.split(':')[0] })
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
          lists={plainLists}
          onLists={setPlainLists}
          demo={data.demo}
          supabase={data.supabase}
          group={data.group}
          groups={data.groups}
          v4={data.v4}
          allPlaces={data.places}
          menuImport={flag('menu_import')}
          menuAi={(data.v4 || data.demo) && flag('menu_ai', isAdmin || data.demo)}
          claims={data.v4 && flag('restaurant_claims')}
          onMealAdded={(meal) => data.setHomeMeals([meal, ...data.homeMeals])}
          onOpenPlace={(p) => setSelected(p)}
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
    </ScaleContext.Provider>
    </SocialContext.Provider>
  )
}
