'use client'
import { identify, resetAnalytics, track } from '@/lib/analytics'
import dynamic from 'next/dynamic'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CheckCheck,
  ChevronDown,
  Dices,
  Map as MapIcon,
  Plus,
  Search,
  Users,
  UtensilsCrossed,
  X,
  ArrowUpDown,
  MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import { Wordmark } from './wordmark'
import { useCrumbsData, type Place } from '@/hooks/use-crumbs-data'
import { PlaceCard, placeAverage } from './place-card'
import { WelcomeCard } from './welcome-card'
import { MapsProvider } from './maps-provider'
import { notifyMates } from '@/lib/push'
import { takePendingAdd } from '@/lib/pending-add'
import { HoursRefresher } from './place-hours'
import { maskRatings, mergeMasked } from '@/lib/place-info'
import { haptic, motionAllowed, useMotionPrefs } from '@/lib/motion'
import { distanceKm } from '@/lib/stats'
import { useUserLocation } from '@/lib/use-user-location'
import { cleanCode, invitePath, isJoinCode, pendingInvite } from '@/lib/invite'
import { SignInForm } from './sign-in-form'
import { StatusFilter } from './status-filter'
import { ProfileButton, ProfileHub, type HubPage } from './profile-hub'
import { SocialContext, useSocialStore } from '@/hooks/use-social'
import { ScaleContext } from './score-input'
import { useFlags } from '@/hooks/use-flags'
import { useDecide } from '@/hooks/use-decide'
import { installErrorReporter } from '@/lib/report-errors'
import { flushQueue } from '@/lib/offline-queue'
import { addFoundPlace } from '@/lib/add-found'
import { fromShare } from '@/lib/maps-link'
import { inArea } from '@/lib/decide-more'
import { catchUpSeen, isNewMember } from '@/lib/catch-up'
import { CatchUpCard } from './catch-up-card'
import { tourDone } from '@/lib/guidebook'
import { GroupSwitcher } from './group-switcher'
import { GroupActions } from './group-actions'
import { oneEmoji } from '@/lib/group-look'
import { cuisineWords, searchAll } from '@/lib/search-all'
import { settingsOf } from '@/lib/ratings'
import { middleOf, openLocationSetup, startAutoLocation } from '@/lib/location'

// Screens and sheets load on demand (then all get fetched quietly once the app is idle),
// so the first paint only carries the Places list.
const load = {
  map: () => import('./map-tab'),
  lists: () => import('./lists-tab'),
  decide: () => import('./decide-tab'),
  group: () => import('./group-tab'),
  home: () => import('./home-tab'),
  place: () => import('./place-sheet'),
  add: () => import('./add-place-sheet'),
  surprise: () => import('./surprise-sheet'),
  quickLog: () => import('./quick-log-sheet'),
  drafts: () => import('./drafts-review'),
  guide: () => import('./guidebook'),
}
function PaneSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-12" />
      <div className="skeleton h-40" />
      <div className="skeleton h-28" />
    </div>
  )
}
const MapTab = dynamic(() => import('./map-tab').then((m) => m.MapTab), { ssr: false, loading: () => <PaneSkeleton /> })
const ListsTab = dynamic(() => import('./lists-tab').then((m) => m.ListsTab), { ssr: false, loading: () => <PaneSkeleton /> })
const DecideTab = dynamic(() => import('./decide-tab').then((m) => m.DecideTab), { ssr: false, loading: () => <PaneSkeleton /> })
const GroupTab = dynamic(() => import('./group-tab').then((m) => m.GroupTab), { ssr: false, loading: () => <PaneSkeleton /> })
const HomeTab = dynamic(() => import('./home-tab').then((m) => m.HomeTab), { ssr: false, loading: () => <PaneSkeleton /> })
const PlaceSheet = dynamic(() => import('./place-sheet').then((m) => m.PlaceSheet), { ssr: false })
const AddPlaceSheet = dynamic(() => import('./add-place-sheet').then((m) => m.AddPlaceSheet), { ssr: false })
const SurpriseSheet = dynamic(() => import('./surprise-sheet').then((m) => m.SurpriseSheet), { ssr: false })
const QuickLogSheet = dynamic(() => import('./quick-log-sheet').then((m) => m.QuickLogSheet), { ssr: false })
const DraftsReview = dynamic(() => import('./drafts-review').then((m) => m.DraftsReview), { ssr: false })
const LocationPrompt = dynamic(() => import('./location-setting').then((m) => m.LocationPrompt), { ssr: false })
const LocationSetupHost = dynamic(() => import('./location-setup').then((m) => m.LocationSetupHost), { ssr: false })
const Walkthrough = dynamic(() => import('./guidebook').then((m) => m.Walkthrough), { ssr: false })

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
/** Where you stand with Crumbs itself (everyone new waits for the gatekeeper's OK). */
type Access = {
  status: 'approved' | 'pending' | 'declined'
  mode: 'admin' | 'everyone' | 'off'
  asked: boolean
  note: string | null
  group: string | null
  gatekeeper: string | null
  is_gatekeeper: boolean
}

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
  const [switching, setSwitching] = useState(false)
  // Each tab keeps its own scroll spot; tapping the tab you're on goes back to the top.
  const scrolls = useRef<Partial<Record<Tab, number>>>({})
  const restore = useRef<number | null>(null)
  function setTab(next: Tab) {
    if (next === tab) {
      haptic('tap')
      window.scrollTo({ top: 0, behavior: motionAllowed() ? 'smooth' : 'auto' })
      return
    }
    haptic('tap')
    scrolls.current[tab] = window.scrollY
    restore.current = scrolls.current[next] ?? 0
    setDirection(tabIndex(next) > tabIndex(tab) ? 'right' : 'left')
    setTabState(next)
    track('tab', { tab: next })
    try {
      sessionStorage.setItem('crumbs-tab', next)
    } catch {}
  }
  useLayoutEffect(() => {
    if (restore.current === null) return
    const top = restore.current
    restore.current = null
    window.scrollTo({ top })
    // Lazy screens can arrive a frame later; try again once they've laid out.
    if (top) requestAnimationFrame(() => window.scrollTo({ top }))
  }, [tab])
  // Places ⇄ Lists ⇄ Home slide the way you tapped.
  const [subDirection, setSubDirection] = useState<'left' | 'right'>('right')
  useEffect(() => {
    const prefetch = () => Object.values(load).forEach((get) => get().catch(() => {}))
    const w = window as any
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prefetch, { timeout: 5000 })
      return () => w.cancelIdleCallback(id)
    }
    const id = setTimeout(prefetch, 3000)
    return () => clearTimeout(id)
  }, [])
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
  const setSelected = useCallback((place: Place | null) => setSelectedId(place?.id ?? null), [])
  const [sort, setSort] = useState<'Newest' | 'Top rated' | 'Nearest' | 'A–Z'>('Newest')
  const [quickLog, setQuickLog] = useState(false)
  // Only asks for location once you pick "Nearest"; falls back to the Home saved in Settings.
  const here = useUserLocation(sort === 'Nearest', { ask: true })
  const origin = here ?? home
  const [adding, setAdding] = useState(false)
  // #163/#164 Home-screen shortcuts (?do=log, ?do=add) and things shared to Crumbs (?title=&text=&url=).
  const [shared, setShared] = useState<{ link: string | null; name: string | null } | null>(null)
  const launched = useRef(false)
  const [surprising, setSurprising] = useState(false)
  const [query, setQuery] = useState('')
  // Typing stays snappy on big groups; the list catches up a beat later.
  const deferredQuery = useDeferredValue(query)
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
  // Location: refresh it each time Crumbs opens (if switched on), and ask once per phone
  // (after the welcome tour) whether to switch it on.
  useEffect(() => startAutoLocation(), [])
  const [askLocation, setAskLocation] = useState(false)
  useEffect(() => {
    if (!data.group || data.demo || data.loading || touring || !tourDone()) return
    if (localStorage.getItem('crumbs-location')) return
    const timer = setTimeout(() => setAskLocation(true), 800)
    return () => clearTimeout(timer)
  }, [data.group, data.demo, data.loading, touring])
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
      searchAll(deferredQuery, {
        places: data.places,
        lists: data.lists,
        meals: data.homeMeals,
        plans: decide?.plans ?? [],
      }),
    [deferredQuery, data.places, data.lists, data.homeMeals, decide?.plans],
  )
  // #128 a saved area to filter the list by
  const [areaName, setAreaName] = useState<string | null>(null)
  const area = (me?.areas ?? []).find((a) => a.name === areaName) ?? null
  // #82: search also looks inside dishes and everyone's notes. Built once per data change,
  // not on every keystroke.
  const haystacks = useMemo(() => {
    const text = new Map<string, string>()
    for (const place of view)
      text.set(
        place.id,
        [
        place.name,
        place.formatted_address,
        place.cuisine,
        cuisineWords(place.cuisine),
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
        .toLowerCase(),
      )
    return text
  }, [view])
  const inFilter = useCallback(
    (place: Place, which: string) =>
      which === 'All' ? true : which === 'Pinned' ? !!place.pinned : place.status === which,
    [],
  )
  // How many each filter chip would show (with the current search and area).
  const counts = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    const base = view.filter(
      (place) =>
        (!area || inArea(place, area)) &&
        (!needle || (haystacks.get(place.id) ?? '').includes(needle)),
    )
    return Object.fromEntries(
      ['All', 'Been', 'Want to try', 'Pinned'].map((f) => [f, base.filter((p) => inFilter(p, f)).length]),
    ) as Record<string, number>
  }, [view, area, deferredQuery, haystacks, inFilter])
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    const list = view.filter(
      (place) =>
        (!area || inArea(place, area)) &&
        inFilter(place, filter) &&
        (!needle || (haystacks.get(place.id) ?? '').includes(needle)),
    )
    if (sort === 'Top rated') {
      const score = new Map(list.map((place) => [place.id, placeAverage(place)]))
      return [...list].sort((a, b) => score.get(b.id)! - score.get(a.id)!)
    }
    if (sort === 'A–Z') return [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'Nearest' && origin) {
      const km = (place: Place) =>
        place.latitude !== null && place.longitude !== null
          ? distanceKm(origin, { lat: place.latitude, lng: place.longitude })
          : Infinity
      return [...list].sort((a, b) => km(a) - km(b))
    }
    return list
  }, [view, filter, deferredQuery, sort, origin, area, haystacks, inFilter])
  // Blind ratings: which cards hide the group score (looked up once, not per card).
  const hiddenIds = useMemo(() => {
    if (!blind) return null
    const ids = new Set<string>()
    for (const real of data.places)
      if (
        !real.place_ratings.some((rating) => rating.user_id === userId) &&
        real.place_ratings.some((rating) => rating.user_id !== userId)
      )
        ids.add(real.id)
    return ids
  }, [blind, data.places, userId])
  const filtersOn = filter !== 'All' || !!areaName || query.trim() !== ''
  function clearFilters() {
    haptic('tap')
    setQuery('')
    setFilter('All')
    setAreaName(null)
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
  /** A code typed in: open its invite page (it explains the group, then joins or asks). */
  function openInvite(code = joinCode) {
    const clean = cleanCode(code)
    if (!isJoinCode(clean)) return toast.error('That code doesn’t look right')
    window.location.href = invitePath(clean)
  }
  // Invite links open their own page (/invite/CODE). Signing in from there can bring you back to
  // the app instead, so send you on to the invite you opened (while you're in no group yet, or
  // right after signing in from it).
  const forwarded = useRef(false)
  useEffect(() => {
    if (!data.user || !data.groupsLoaded || data.demo || forwarded.current) return
    const pending = pendingInvite()
    if (!pending) return
    if (data.groups.length && Date.now() - pending.at > 15 * 60_000) return
    forwarded.current = true
    window.location.replace(invitePath(pending.code))
  }, [data.user, data.groupsLoaded, data.groups.length, data.demo])
  // Invite-only for now: are you let into Crumbs yet (everyone new waits for the gatekeeper's OK),
  // can you start a group, and which groups are you waiting on?
  const [gate, setGate] = useState<{
    canStart: boolean
    waiting: { group_id: string; name: string; emoji: string | null }[]
    access: Access | null
  } | null>(null)
  const loadGate = useCallback(async () => {
    const [start, waiting, access] = await Promise.all([
      data.supabase.rpc('can_start_group'),
      data.supabase.rpc('my_join_requests'),
      data.supabase.rpc('my_access'),
    ])
    // Before the invites / approval SQL has run these fail: keep today's screen.
    const next = {
      canStart: start.error ? true : !!start.data,
      waiting: waiting.data ?? [],
      access: access.error ? null : ((access.data as Access | null) ?? null),
    }
    setGate(next)
    return next
  }, [data.supabase])
  useEffect(() => {
    if (!data.user || !data.groupsLoaded || data.group || data.demo) return
    loadGate()
  }, [data.user, data.groupsLoaded, data.group, data.demo, loadGate])
  // Waiting for the gatekeeper: look every 15 s (while the screen is showing); once let in, reload
  // (you may already be in the group you were invited to).
  const askedIn = !!gate?.access?.asked && gate.access.status === 'pending'
  useEffect(() => {
    if (!askedIn || !data.user || data.group) return
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      const { data: access } = await data.supabase.rpc('my_access')
      if (access?.status === 'approved') window.location.reload()
    }, 15_000)
    return () => clearInterval(timer)
  }, [askedIn, data.user, data.group, data.supabase])
  const [note, setNote] = useState('')
  async function askIn() {
    setBusy(true)
    const { error } = await data.supabase.rpc('request_access', { code: null, note: note.trim() || null })
    setBusy(false)
    if (error) return toast.error(error.message)
    haptic('success')
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'access_request' }),
    }).catch(() => {})
    loadGate()
  }
  async function cancelAsk() {
    setBusy(true)
    const { error } = await data.supabase.rpc('cancel_access_request')
    setBusy(false)
    if (error) return toast.error(error.message)
    toast('Request cancelled')
    loadGate()
  }
  // Waiting to be let in: look every 15 s (while the screen is showing) and open the app once in.
  const waitingOn = gate?.waiting.length ?? 0
  useEffect(() => {
    if (!waitingOn || !data.user || data.group) return
    const uid = data.user.id
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      const { data: rows } = await data.supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', uid)
        .limit(1)
      if (rows?.length) window.location.reload()
    }, 15_000)
    return () => clearInterval(timer)
  }, [waitingOn, data.user, data.group, data.supabase])
  useEffect(() => {
    if (!data.user || !data.group || data.loading || launched.current || typeof window === 'undefined')
      return
    launched.current = true
    const params = new URLSearchParams(window.location.search)
    const action = params.get('do')
    const incoming = fromShare(params)
    // #212 scanned a restaurant's "Find us on Crumbs" poster: add it (or open it if it's saved)
    // (or "Save to try" on a public restaurant page, remembered across signing in)
    const pendingAdd = takePendingAdd()
    const addId = params.get('add') ?? pendingAdd
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
          <Wordmark height={38} />
          <h1 className="mt-8 font-serif text-4xl font-bold">Your shared food map</h1>
          <p className="mt-3 leading-6 text-muted-foreground">
            Collect the places and dishes you love together.{' '}
            <a href="/welcome" className="font-semibold text-primary underline">
              What is Crumbs?
            </a>
          </p>
          <SignInForm supabase={data.supabase} />
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Crumbs is invite-only for now. Got an invite link? Open it to join your group.
          </p>
        </div>
      </main>
    )
  if (!data.groupsLoaded)
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <p className="text-muted-foreground">Loading Crumbs…</p>
      </main>
    )
  if (!data.group) {
    const codeBox = (
      <section className="surface">
        <h2 className="font-serif text-2xl font-bold">Have a code?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The 6-letter code from your invite, or just open the invite link.
        </p>
        <input
          aria-label="Join code"
          onKeyDown={(event) => event.key === 'Enter' && openInvite()}
          className="field mt-4 uppercase tracking-widest"
          maxLength={8}
          placeholder="ABC123"
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
        />
        <button
          className="secondary mt-3 w-full"
          disabled={!isJoinCode(joinCode)}
          onClick={() => openInvite()}
        >
          Open invite
        </button>
      </section>
    )
    const waiting = gate?.waiting ?? []
    const access = gate?.access
    if (access && access.status !== 'approved') {
      const keeper = access.gatekeeper || 'The Crumbs team'
      return (
        <main className="min-h-screen bg-background p-5">
          <div className="mx-auto flex max-w-xl flex-col gap-4 pt-8">
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-serif text-4xl font-bold">Almost there</h1>
              <button
                className="secondary !min-h-10 !px-3 text-xs"
                onClick={() => data.supabase.auth.signOut()}
              >
                Sign out
              </button>
            </div>
            {access.status === 'declined' ? (
              <section className="surface">
                <h2 className="font-serif text-2xl font-bold">Crumbs isn’t open to you right now</h2>
                <p className="mt-2 leading-6 text-muted-foreground">
                  You’re signed in as {data.user.email}. If you think that’s a mistake, ask whoever
                  invited you to check with {keeper}.
                </p>
                <a href="/welcome#waitlist" className="secondary mt-4 block w-full text-center">
                  Join the waitlist
                </a>
              </section>
            ) : access.asked ? (
              <section className="surface flex flex-col gap-3" role="status">
                <p className="invite-waiting">
                  <span className="invite-dot" aria-hidden="true" />
                  Waiting for {keeper} to let you into Crumbs
                </p>
                <p className="text-sm text-muted-foreground">
                  {access.group
                    ? `Once they say yes you’ll head to ${access.group}. `
                    : 'Once they say yes you can start or join a group. '}
                  Keep this open, or come back later.
                </p>
                <button className="secondary w-full" disabled={busy} onClick={cancelAsk}>
                  Cancel request
                </button>
              </section>
            ) : access.mode === 'off' ? (
              <section className="surface">
                <h2 className="font-serif text-2xl font-bold">Crumbs isn’t taking new people right now</h2>
                <p className="mt-2 leading-6 text-muted-foreground">
                  Join the waitlist and you’ll hear when it opens up.
                </p>
                <a href="/welcome#waitlist" className="primary mt-4 block w-full text-center">
                  Join the waitlist
                </a>
              </section>
            ) : (
              <>
                <section className="surface">
                  <h2 className="font-serif text-2xl font-bold">Crumbs lets people in one by one</h2>
                  <p className="mt-2 leading-6 text-muted-foreground">
                    {keeper} checks everyone who joins. Got an invite link? Open it and ask from there
                    — you’ll head to that group once you’re in. No link? Ask here.
                  </p>
                  <textarea
                    aria-label="Who are you? (optional)"
                    className="field mt-4 min-h-20"
                    maxLength={300}
                    placeholder="Who are you, or who sent you? (optional)"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <button className="primary mt-3 w-full" disabled={busy} onClick={askIn}>
                    {busy ? 'One moment…' : 'Ask to join Crumbs'}
                  </button>
                </section>
                {codeBox}
              </>
            )}
          </div>
        </main>
      )
    }
    return (
      <main className="min-h-screen bg-background p-5">
        <div className="mx-auto flex max-w-xl flex-col gap-4 pt-8">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-serif text-4xl font-bold">
              {gate && !gate.canStart ? 'Almost there' : 'Start your food map'}
            </h1>
            <button
              className="secondary !min-h-10 !px-3 text-xs"
              onClick={() => data.supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
          {waiting.map((w) => (
            <section key={w.group_id} className="surface" role="status">
              <p className="invite-waiting">
                <span className="invite-dot" aria-hidden="true" />
                Waiting to be let into {w.emoji ? `${w.emoji} ` : ''}
                {w.name}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You’ll get in as soon as the owner says yes — open Crumbs again, or your invite link.
              </p>
            </section>
          ))}
          {!gate ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : gate.canStart ? (
            <>
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
              {codeBox}
            </>
          ) : (
            <>
              <section className="surface">
                <h2 className="font-serif text-2xl font-bold">Crumbs is invite-only for now</h2>
                <p className="mt-2 leading-6 text-muted-foreground">
                  You’re signed in as {data.user.email}. To get in, open the invite link someone in
                  a group sent you — it shows the group and lets you join from there.
                </p>
                <a href="/welcome#waitlist" className="primary mt-4 block w-full text-center">
                  No invite? Join the waitlist
                </a>
              </section>
              {codeBox}
            </>
          )}
        </div>
      </main>
    )
  }
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
          <Wordmark height={38} />
          <ProfileButton profile={me} onClick={() => setHub(['menu'])} />
        </header>
        {/* The group name is the group switcher: switch, start a new group, join, find one. */}
        <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          className="group-title min-w-0 flex-1"
          aria-label={`${data.group.name} — switch, create or join a group`}
          onClick={() => {
            haptic('tap')
            setSwitching(true)
          }}
        >
          <span className="text-sm text-muted-foreground">Your shared food map</span>
          <span className="group-name-row font-serif font-bold">
            {oneEmoji(data.group.emoji) && (
              <span
                className="group-badge"
                style={{ background: data.group.color ?? undefined }}
                aria-hidden="true"
              >
                {oneEmoji(data.group.emoji)}
              </span>
            )}
            {/* Long names drop a size and wrap onto a second line instead of running under the buttons. */}
            <span
              className={`group-name ${
                data.group.name.length > 22
                  ? 'text-xl'
                  : data.group.name.length > 14
                    ? 'text-2xl'
                    : 'text-3xl'
              }`}
            >
              {data.group.name}
            </span>
            <ChevronDown size={22} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          </span>
        </button>
        <GroupActions
          group={data.group}
          members={data.members}
          userId={userId}
          supabase={data.supabase}
          demo={data.demo}
          v4={data.v4}
          onGroup={(group) => {
            data.setGroup(group)
            data.setGroups((current) => current.map((item) => (item.id === group.id ? group : item)))
          }}
          onReload={() => {
            data.load().catch(() => {})
          }}
        />
        </div>
        {switching && (
          <GroupSwitcher
            group={data.group}
            groups={data.groups}
            supabase={data.supabase}
            demo={data.demo}
            onClose={() => setSwitching(false)}
            onSwitch={(g) => {
              setSwitching(false)
              setHub([])
              data.setGroup(g)
            }}
            onCreated={(g) => {
              setSwitching(false)
              setHub([])
              data.setGroups((current) => [...current, g])
              data.setGroup(g)
              setTab('Group')
            }}
            onJoined={(g) => {
              setSwitching(false)
              setHub([])
              data.setGroups((current) =>
                current.some((item) => item.id === g.id) ? current : [...current, g],
              )
              data.setGroup(g)
            }}
          />
        )}
        {touring && <Walkthrough onDone={() => setTouring(false)} />}
        {askLocation && !touring && <LocationPrompt onDone={() => setAskLocation(false)} />}
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
                      setSubDirection(views.indexOf(view) > views.indexOf(placesView) ? 'right' : 'left')
                      setPlacesView(view)
                    }}
                  >
                    {view === 'places' ? 'Places' : view === 'lists' ? 'Lists' : 'Home'}
                  </button>
                ))}
              </div>
              {placesView === 'home' && views.includes('home') ? (
                <div key="home" className={`tab-pane tab-from-${subDirection}`}>
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
                <div key="lists" className={`tab-pane tab-from-${subDirection}`}>
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
                    onPlaceAdded={(p) => data.setPlaces((current) => [p, ...current])}
                  />
                </div>
              ) : (
                <div key="places" className={`tab-pane tab-from-${subDirection} flex flex-col gap-4`}>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                        size={18}
                      />
                      <input
                        aria-label="Search places"
                        className="field field-icon search-field"
                        placeholder="Search places, dishes, notes"
                        type="search"
                        enterKeyHint="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => event.key === 'Escape' && query && setQuery('')}
                      />
                      {query && (
                        <button
                          type="button"
                          className="search-clear"
                          aria-label="Clear search"
                          onClick={() => {
                            haptic('tap')
                            setQuery('')
                          }}
                        >
                          <X size={16} strokeWidth={2.5} />
                        </button>
                      )}
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
                  {deferredQuery.trim().length >= 2 && (found || filtered.length > 0) && (
                    // #225 everything that matches, grouped: places first, then food, lists…
                    <div className="surface-soft rise-panel flex flex-col gap-2 text-sm">
                      {filtered.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Places
                          </p>
                          {filtered.slice(0, 5).map((place) => (
                            <button key={place.id} className="text-left" onClick={() => setSelected(place)}>
                              📍 <strong>{place.name}</strong>
                              {place.cuisine && <span className="text-muted-foreground"> · {place.cuisine}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {found && found.dishes.length > 0 && (
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
                      {found && found.lists.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Lists
                          </p>
                          {found.lists.map((l) => (
                            <button key={l.id} className="text-left" onClick={() => (setSubDirection('right'), setPlacesView('lists'))}>
                              {l.emoji} <strong>{l.name}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                      {found && found.plans.length > 0 && (
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
                      {found && found.meals.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Home cooking
                          </p>
                          {found.meals.map((m) => (
                            <button key={m.id} className="text-left" onClick={() => (setSubDirection('right'), setPlacesView('home'))}>
                              🍳 <strong>{m.name}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <StatusFilter
                    items={STATUSES}
                    display={(item) => (item === 'Pinned' ? '📌 Pinned' : item)}
                    value={filter}
                    counts={!data.loading && data.places.length > 0 ? counts : null}
                    onChange={(item) => {
                      if (item !== filter) haptic('select')
                      setFilter(item)
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="pick-pill">
                      <ArrowUpDown size={15} aria-hidden="true" />
                      <span aria-hidden="true">{sort}</span>
                      <select
                        aria-label="Sort by"
                        value={sort}
                        onChange={(event) => {
                          haptic('select')
                          setSort(event.target.value as typeof sort)
                        }}
                      >
                        {(['Newest', 'Top rated', 'Nearest', 'A–Z'] as const).map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} aria-hidden="true" />
                    </label>
                    {(me?.areas?.length ?? 0) > 0 && (
                      <label className={`pick-pill ${areaName ? 'pick-pill-on' : ''}`}>
                        <MapPin size={15} aria-hidden="true" />
                        <span aria-hidden="true">{areaName ? `Near ${areaName}` : 'Anywhere'}</span>
                        <select
                          aria-label="Area"
                          value={areaName ?? ''}
                          onChange={(event) => {
                            haptic('select')
                            setAreaName(event.target.value || null)
                          }}
                        >
                          <option value="">Anywhere</option>
                          {me!.areas!.map((a) => (
                            <option key={a.name} value={a.name}>
                              Near {a.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={15} aria-hidden="true" />
                      </label>
                    )}
                    {filtersOn && (
                      <button type="button" className="text-sm font-semibold text-primary" onClick={clearFilters}>
                        Reset
                      </button>
                    )}
                  </div>
                  {sort === 'Nearest' && !origin && (
                    <p className="text-xs text-muted-foreground">
                      Finding you… If location is blocked, see{' '}
                      <button
                        type="button"
                        className="font-semibold text-primary underline"
                        onClick={openLocationSetup}
                      >
                        Location setup
                      </button>{' '}
                      or set Home in Settings to sort by distance.
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
                    <div className="stagger place-list flex flex-col gap-4">
                      {filtered.map((place) => (
                        <PlaceCard
                          key={place.id}
                          place={place}
                          names={names}
                          members={data.members}
                          home={home}
                          hidden={!!hiddenIds?.has(place.id)}
                          onSelect={setSelected}
                        />
                      ))}
                    </div>
                  ) : data.places.length > 0 && filtersOn ? (
                    <div className="empty pop-in">
                      <p className="text-4xl" aria-hidden="true">🔍</p>
                      <p className="mt-2 font-serif text-xl font-bold">Nothing matches</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {query.trim()
                          ? `No places with “${query.trim()}”${filter !== 'All' ? ` in ${filter}` : ''}${areaName ? ` around ${areaName}` : ''}.`
                          : `No places in ${filter !== 'All' ? filter : 'this view'}${areaName ? ` around ${areaName}` : ''} yet.`}
                      </p>
                      <button className="secondary mx-auto mt-4" onClick={clearFilters}>
                        Show everything
                      </button>
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
                supabase={data.supabase}
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
              onGroup={(group) => {
                data.setGroup(group)
                data.setGroups((current) => current.map((item) => (item.id === group.id ? group : item)))
              }}
              v4={data.v4}
              onReload={() => {
                data.load().catch(() => {})
              }}
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
          onGroups={() => {
            setHub([])
            setSwitching(true)
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
          near={middleOf(data.places)}
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
          onPlaceAdded={(p) => data.setPlaces((current) => [p, ...current])}
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
      <LocationSetupHost />
    </main>
    </ScaleContext.Provider>
    </SocialContext.Provider>
  )
}

/** All · Been · Want to try · Pinned (the bar itself lives in status-filter.tsx). */
const STATUSES = ['All', 'Been', 'Want to try', 'Pinned'] as const
