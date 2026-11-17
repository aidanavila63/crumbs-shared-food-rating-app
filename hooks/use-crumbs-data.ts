'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { pendingDeletes } from '@/lib/undoable'
import { createClient } from '@/lib/supabase'
import type { Facts, Hours } from '@/lib/place-info'
import { cacheGroup, cachedGroup, isNetworkError, isOffline, readCachedGroup } from '@/lib/offline-drafts'
import { MAX_PLACES_LIVE, mergePlaces, placeOfChange } from '@/lib/live-places'
import { withPrivateSpends, type PrivateSpend } from '@/lib/private-spend'
import { orderSpaces } from '@/lib/spaces'
import { withSharedMeals } from '@/lib/meal-sharing'

export type Status = 'Been' | 'Want to try'
export type Rating = {
  user_id: string
  score: number
  notes: string | null
  points?: number | null
  // v4 (#1 categories, #3 would go back)
  food?: number | null
  service?: number | null
  vibe?: number | null
  value?: number | null
  would_return?: 'yes' | 'maybe' | 'no' | null
  /** #12 only you see it until you post it */
  draft?: boolean | null
  /** #112 one-tap reasons ("Great service") */
  reasons?: string[] | null
}
export type VisitKind = 'dine_in' | 'takeout' | 'delivery'
export type PlaceVisit = {
  id: string
  place_id: string
  visited_on: string
  spend: number | null
  // v4 (#5 score, #6 people, #78 kind, #37 who picked, #69/#70 memories)
  score?: number | null
  people?: number | null
  kind?: VisitKind | null
  picked_by?: string | null
  occasion?: 'date' | 'celebration' | null
  milestone?: string | null
  note?: string | null
  created_by?: string | null
  /** #147 breakfast / lunch / dinner / late, #145 how long you waited */
  meal_time?: 'breakfast' | 'lunch' | 'dinner' | 'late' | null
  wait_minutes?: number | null
}
export type Dish = {
  verdict?: 'again' | 'never' | null
  tags?: string[]
  // v4 (#18 course, #17 dietary + spice, #16 wishlist)
  course?: 'starter' | 'main' | 'side' | 'dessert' | 'drink' | null
  dietary?: string[]
  spice?: number | null
  wishlist?: boolean
  /** #119 good to share between this many people */
  shares?: number | null
  id: string
  place_id: string
  name: string
  price: number | null
  description: string | null
  is_ai_suggestion: boolean
  created_at?: string
  photo_path?: string | null
  dish_ratings: Rating[]
}
export type Place = {
  id: string
  group_id: string
  name: string
  formatted_address: string | null
  latitude: number | null
  longitude: number | null
  google_place_id: string
  price_level: number | null
  cuisine: string | null
  website: string | null
  google_maps_url: string | null
  status: Status
  pinned: boolean
  visited_on?: string | null
  photo_path?: string | null
  opening_hours?: Hours | null
  business_status?: string | null
  hours_checked_at?: string | null
  place_facts?: Facts | Facts[] | null
  place_visits?: PlaceVisit[]
  tags: string[]
  created_at: string
  place_ratings: Rating[]
  dishes?: Dish[]
  // v4: the shared restaurant profile this place is linked to (#27)
  restaurant_id?: string | null
}
/** Everything a place carries in the app (the full load and live updates read the same). */
const PLACE_SELECT =
  '*,place_ratings(*),place_visits(*),place_facts(*),dishes(*,dish_ratings(score,points,user_id,notes))'

export type GroupSettings = {
  scale?: '5' | 'half' | '10' // #2
  categories?: boolean // #1
  wouldReturn?: boolean // #3
  turns?: boolean // #37
  trips?: boolean // #29 (on unless false)
  home?: boolean // #77 (on unless false)
  weather?: boolean // #35 (on unless false)
  tags?: string[] // #8 preset vibe tags
  /** Round 75: every member (not guests) may add group locations, not just the owner/admins */
  members_add_locations?: boolean
  /** Round 77: the group location Decide, Tonight, Surprise and Explore measure from */
  main_location?: string | null
}
export type Group = {
  id: string
  name: string
  join_code: string
  /** #135 code for view-only guests (owner/admin) */
  guest_code?: string | null
  created_by: string
  settings?: GroupSettings | null
  emoji?: string | null
  color?: string | null
  /** #46 cover photo path in the photo bucket */
  cover_path?: string | null
  /** public = its name shows in Find a group (contents stay inside the group) */
  visibility?: 'private' | 'public' | null
  /** how people get in: code/link only, ask the owner, or anyone */
  join_mode?: 'invite' | 'request' | 'open' | null
  description?: string | null
  /** invite links: false = join straight away, true = the owner/admins let each person in */
  invite_approval?: boolean | null
  /** Round 80: My Crumbs, your private space (nobody else can ever join it) */
  is_personal?: boolean | null
}
export type Ingredient = { qty: string; unit: string; item: string }
export type HomeMealRating = { user_id: string; score: number; notes: string | null }
export type HomeMealCook = {
  id: string
  meal_id: string
  cooked_on: string
  cooked_by: string | null
}
export type HomeMeal = {
  id: string
  group_id: string
  name: string
  status: 'Cooked' | 'Want to cook'
  verdict: 'again' | 'never' | null
  recipe_url: string | null
  notes: string | null
  photo_path: string | null
  dietary: string[]
  spice: number | null
  created_by: string
  created_at: string
  /** #123 made from this restaurant dish */
  from_dish?: string | null
  /** #123 shared with everyone on Crumbs (rated + tips) */
  recipe_public?: boolean | null
  recipe?: string | null
  /** Breakfast, Main, Soup, Dessert… */
  kind?: string | null
  cuisine?: string | null
  /** amount + measure + what, one row each */
  ingredients?: Ingredient[] | null
  home_meal_ratings: HomeMealRating[]
  home_meal_cooks: HomeMealCook[]
}
export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  avoid?: string[] | null
  blind_ratings?: boolean | null
  // v4
  is_admin?: boolean | null
  /** trusted by an admin to build Crumbs' data: answers count straight away */
  is_builder?: boolean | null
  notify?: Record<string, boolean> | null
  /** Runs a restaurant page as its verified owner (which one is never shown). */
  restaurant_owner?: boolean | null
  /** #47 copy my ratings to my other groups that saved the same place */
  share_ratings?: 'group' | 'all' | 'ask'
  /** Round 80 (#20): the amounts on visits I log stay mine (still counted in anonymous totals) */
  private_spend?: boolean | null
  /** your own row only: is your public profile on, and its @handle */
  profile_public?: boolean | null
  handle?: string | null
  /** #135 guests can look but not change anything */
  role?: 'owner' | 'admin' | 'member' | 'guest' | null
  /** #190 when they joined this group */
  joined_at?: string | null
  /** #181 hottest spice that's fine (0-3, null = anything) */
  spice_max?: number | null
  /** #121 diet (Vegetarian, Vegan, Gluten-free…) and the Safe for me switch */
  diet?: string[] | null
  safe_for_me?: boolean | null
  /** #128 saved areas to filter by — private: only ever filled in on your own profile */
  areas?: Area[] | null
}
/** A named spot with a radius: one of your private places, or one a whole group shares. */
export type Area = { name: string; lat: number; lng: number; km: number }
/** Round 75: a location everyone in a group can use (a work group's office for lunches). */
export type GroupLocation = Area & { id: string; group_id: string; created_by?: string | null }
export type List = {
  id: string
  group_id: string
  name: string
  emoji: string
  list_places?: { place_id: string; position?: number | null }[]
  kind?: 'list' | 'crawl' | null
  trip_city?: string | null
  starts_on?: string | null
  ends_on?: string | null
}

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const demoUser = { id: 'demo-user', email: 'demo@crumbs.test' }
const demoGroup: Group = {
  id: 'demo-group',
  name: 'Maya & Jordan',
  join_code: 'CRUMBS',
  created_by: demoUser.id,
  emoji: '🍜',
  color: '#7b2d5b',
  settings: { scale: '5', categories: true, wouldReturn: true, turns: true },
}
const demoPlaces: Place[] = [
  {
    id: 'demo-place',
    group_id: demoGroup.id,
    name: 'Saffron Table',
    formatted_address: '12 Market Street',
    latitude: 37.7749,
    longitude: -122.4194,
    google_place_id: 'demo-saffron',
    price_level: 2,
    cuisine: 'Mediterranean',
    website: null,
    google_maps_url: 'https://maps.google.com',
    status: 'Want to try',
    pinned: true,
    tags: ['date night'],
    created_at: new Date().toISOString(),
    place_ratings: [],
    dishes: [],
  },
  ...(
    [
      ['demo-dumpling', 'Golden Dumpling House', 'Chinese', 37.7712, -122.4313, 1],
      ['demo-pizza', 'Forno Bianco', 'Pizza', 37.7765, -122.4241, 2],
    ] as const
  ).map(
    ([id, name, cuisine, latitude, longitude, price], i): Place => ({
      id,
      group_id: demoGroup.id,
      name,
      formatted_address: `${40 + i * 9} Mission Street`,
      latitude,
      longitude,
      google_place_id: id,
      price_level: price,
      cuisine,
      website: null,
      google_maps_url: 'https://maps.google.com',
      status: 'Want to try',
      pinned: false,
      tags: [],
      created_at: new Date(Date.now() - (i + 5) * 864e5).toISOString(),
      place_ratings: [],
      dishes: [],
    }),
  ),
  // A few rated places so demo mode shows stats, badges, challenges and map pins.
  ...(
    [
      ['demo-ramen', 'Hana Ramen', 'Ramen', 37.7793, -122.4192, 5, 4, 2],
      ['demo-taco', 'Taquería Sol', 'Mexican', 37.7651, -122.4219, 4, 5, 1],
      ['demo-thai', 'Baan Thai', 'Thai', 37.7849, -122.4094, 3, 4, 2],
    ] as const
  ).map(([id, name, cuisine, latitude, longitude, mine, theirs, price], index): Place => ({
    id,
    group_id: demoGroup.id,
    name,
    formatted_address: `${10 + index * 7} Valencia Street`,
    latitude,
    longitude,
    google_place_id: id,
    restaurant_id: `demo-r-${id}`,
    price_level: price,
    cuisine,
    website: null,
    google_maps_url: 'https://maps.google.com',
    status: 'Been',
    pinned: false,
    tags: [['Cozy', 'Quick'], ['Patio'], ['Cozy']][index],
    created_at: new Date(Date.now() - (index + 1) * 864e5).toISOString(),
    place_visits: [
      {
        id: `${id}-v`,
        place_id: id,
        visited_on: new Date(Date.now() - (index + 1) * 864e5).toISOString().slice(0, 10),
        spend: 40 + index * 15,
      },
    ],
    place_ratings: [
      { user_id: 'demo-user', score: mine, notes: null },
      { user_id: 'demo-partner', score: theirs, notes: null },
    ],
    dishes: [
      {
        id: `${id}-dish`,
        place_id: id,
        name: ['Tonkotsu', 'Al pastor', 'Khao soi'][index],
        price: null,
        description: null,
        is_ai_suggestion: false,
        verdict: 'again',
        dish_ratings: [{ user_id: 'demo-user', score: 5, notes: null, points: 92 - index * 6 }],
      },
      ...(index === 0
        ? [
            {
              id: `${id}-gyoza`,
              place_id: id,
              name: 'Pork gyoza',
              price: 9,
              description: null,
              is_ai_suggestion: false,
              course: 'starter' as const,
              tags: ['shareable'],
              dish_ratings: [{ user_id: 'demo-partner', score: 4, notes: null, points: 84 }],
            },
            {
              id: `${id}-karaage`,
              place_id: id,
              name: 'Karaage',
              price: 12,
              description: null,
              is_ai_suggestion: false,
              wishlist: true,
              spice: 2,
              dish_ratings: [],
            },
          ]
        : []),
    ],
  })),
]
const demoMeals: HomeMeal[] = [
  {
    id: 'demo-meal-1',
    group_id: demoGroup.id,
    name: 'Sunday lasagna',
    status: 'Cooked',
    verdict: 'again',
    recipe_url: null,
    notes: 'Extra ricotta next time',
    recipe: 'Layer ragù, béchamel, ricotta and sheets; 45 min at 190°C; rest 15 min.',
    recipe_public: true,
    photo_path: null,
    dietary: ['vegetarian'],
    spice: 0,
    created_by: 'demo-partner',
    created_at: new Date(Date.now() - 4 * 864e5).toISOString(),
    home_meal_ratings: [
      { user_id: 'demo-user', score: 5, notes: null },
      { user_id: 'demo-partner', score: 4, notes: null },
    ],
    home_meal_cooks: [
      {
        id: 'demo-cook-1',
        meal_id: 'demo-meal-1',
        cooked_on: '2026-10-19',
        cooked_by: 'demo-partner',
      },
    ],
  },
  {
    id: 'demo-meal-2',
    group_id: demoGroup.id,
    name: 'Homemade dumplings',
    status: 'Want to cook',
    verdict: null,
    recipe_url: 'https://example.com/dumplings',
    notes: null,
    photo_path: null,
    dietary: [],
    spice: 1,
    created_by: 'demo-user',
    created_at: new Date(Date.now() - 864e5).toISOString(),
    home_meal_ratings: [],
    home_meal_cooks: [],
  },
]
const demoMembers: Profile[] = [
  {
    id: 'demo-user',
    display_name: 'Jordan',
    avatar_url: null,
    avoid: [],
    blind_ratings: false,
    is_admin: true,
    restaurant_owner: true,
    share_ratings: 'ask',
    private_spend: false,
    role: 'owner',
  },
  {
    id: 'demo-partner',
    display_name: 'Maya',
    avatar_url: null,
    avoid: [],
    blind_ratings: false,
    role: 'member',
  },
]

export function useCrumbsData() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<any>(demo ? demoUser : null)
  const [groups, setGroups] = useState<Group[]>(demo ? [demoGroup] : [])
  const [group, setGroup] = useState<Group | null>(demo ? demoGroup : null)
  const [places, setPlaces] = useState<Place[]>(demo ? demoPlaces : [])
  const [lists, setLists] = useState<List[]>([])
  const [members, setMembers] = useState<Profile[]>(demo ? demoMembers : [])
  const [homeMeals, setHomeMeals] = useState<HomeMeal[]>(demo ? demoMeals : [])
  const [groupLocations, setGroupLocations] = useState<GroupLocation[]>([])
  // false until 20261114_audit_fixes.sql has run (the table isn't there yet): the button stays hidden
  const [locationsReady, setLocationsReady] = useState(demo)
  // v4 = the 20261025 database update has been run. Until then new features stay hidden.
  const [v4, setV4] = useState(demo)
  // #166 when the network is down: the saved copy's time (null = live data)
  const [offlineCopy, setOfflineCopy] = useState<string | null>(null)
  const [loading, setLoading] = useState(!demo)
  const [groupsLoaded, setGroupsLoaded] = useState(demo)
  const loadedOnce = useRef(false)
  const privateSpends = useRef<PrivateSpend[]>([])

  const placesRef = useRef<Place[]>([])
  /** which group's live data is on screen (a saved copy never replaces it) */
  const liveFor = useRef<string | null>(null)
  useEffect(() => {
    placesRef.current = places
  }, [places])

  const load = useCallback(async () => {
    if (demo || !user || !group) return
    if (!loadedOnce.current) setLoading(true)
    // Everything that only needs the group id goes out together (was 4 round trips in a row).
    const [
      { data: placeRows, error: placesError },
      { data: listRows, error: listsError },
      { data: memberRows },
      meals,
      safeProfiles,
      myProfile,
      myPlaces,
      sharedSpots,
      mySpends,
      sharedMeals,
    ] = await Promise.all([
        supabase
          .from('places')
          .select(PLACE_SELECT)
          .eq('group_id', group.id)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('lists').select('*,list_places(*)').eq('group_id', group.id),
        supabase.from('group_members').select('*').eq('group_id', group.id),
        // Is the v4 database update in? (home_meals only exists after it.)
        supabase
          .from('home_meals')
          .select(
            '*,home_meal_ratings(user_id,score,notes),home_meal_cooks(id,meal_id,cooked_on,cooked_by)',
          )
          .eq('group_id', group.id)
          .order('created_at', { ascending: false }),
        // Round 75: group-mates' names, photos and the few things the app shows about them come
        // from one database function; your own row comes in full; your saved areas live in a
        // table only you can read; the group's shared locations in another. Each of these is
        // missing until 20261114_audit_fixes.sql has run — then the old way below is used.
        supabase.rpc('group_profiles', { target_group: group.id }),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('private_places').select('areas').eq('user_id', user.id).maybeSingle(),
        supabase.from('group_locations').select('id,group_id,name,lat,lng,km,created_by').eq('group_id', group.id).order('created_at'),
        // Round 80: your own private amounts (none, or missing before 20261119_round80.sql)
        supabase.from('private_spends').select('visit_id,amount').eq('user_id', user.id),
        // Round 81: recipes people shared into this group (they live in their owner's My Crumbs)
        supabase
          .from('home_meal_shares')
          .select(
            'home_meals(*,home_meal_ratings(user_id,score,notes),home_meal_cooks(id,meal_id,cooked_on,cooked_by))',
          )
          .eq('group_id', group.id),
      ])
    if (placesError) throw placesError
    if (listsError) throw listsError
    const ids = (memberRows ?? []).map((row: any) => row.user_id)
    const roles = Object.fromEntries((memberRows ?? []).map((row: any) => [row.user_id, row.role]))
    const joined = Object.fromEntries(
      (memberRows ?? []).map((row: any) => [row.user_id, row.joined_at ?? null]),
    )
    let profileRows: Profile[] = []
    if (ids.length) {
      let rows: Profile[]
      if (!safeProfiles.error && Array.isArray(safeProfiles.data)) {
        const mine = (myProfile.data ?? null) as Profile | null
        rows = (safeProfiles.data as Profile[]).map((row) =>
          row.id === user.id && mine ? { ...row, ...mine } : row,
        )
      } else {
        const { data } = await supabase.from('profiles').select('*').in('id', ids)
        rows = (data ?? []) as Profile[]
      }
      const areas = !myPlaces.error && Array.isArray(myPlaces.data?.areas) ? (myPlaces.data.areas as Area[]) : null
      profileRows = rows.map((row) => ({
        ...row,
        // private places: yours come from your own table; nobody else's are ever loaded
        areas: row.id === user.id ? (areas?.length ? areas : (row.areas ?? [])) : [],
        role: row.id === group.created_by ? 'owner' : (roles[row.id] ?? 'member'),
        joined_at: joined[row.id] ?? null,
      }))
    }
    setGroupLocations(sharedSpots.error ? [] : ((sharedSpots.data ?? []) as GroupLocation[]))
    setLocationsReady(!sharedSpots.error)
    setV4(!meals.error)
    const allMeals = meals.error
      ? []
      : withSharedMeals(
          (meals.data ?? []) as HomeMeal[],
          sharedMeals.error ? [] : ((sharedMeals.data ?? []) as unknown as { home_meals: HomeMeal | null }[]),
        )
    setHomeMeals(allMeals)
    setMembers(profileRows)
    privateSpends.current = mySpends.error ? [] : ((mySpends.data ?? []) as PrivateSpend[])
    setPlaces(
      withPrivateSpends(
        ((placeRows ?? []) as Place[]).filter((place) => !pendingDeletes.has(place.id)),
        privateSpends.current,
      ),
    )
    setLists(((listRows ?? []) as List[]).filter((list) => !pendingDeletes.has(list.id)))
    setOfflineCopy(null)
    // #166 keep a copy on the phone for when there's no signal
    cacheGroup(group.id, {
      places: placeRows ?? [],
      lists: listRows ?? [],
      members: profileRows,
      homeMeals: allMeals,
      v4: !meals.error,
    })
    loadedOnce.current = true
    liveFor.current = group.id
    setLoading(false)
  }, [group, supabase, user])

  useEffect(() => {
    if (demo) return
    // #166 With no signal, checking the sign-in with the server fails — that must not sign you
    // out. Fall back to the sign-in saved on this phone (the cached group copy then opens).
    const fromPhone = async () => (await supabase.auth.getSession()).data.session?.user ?? null
    supabase.auth
      .getUser()
      .then(async ({ data, error }: any) => {
        let next = data.user
        if (!next && (isOffline() || isNetworkError(error))) next = await fromPhone()
        setUser((prev: any) => (prev?.id === next?.id ? prev : next))
        setLoading(false)
      })
      .catch(async () => {
        const next = await fromPhone().catch(() => null)
        setUser((prev: any) => (prev?.id === next?.id ? prev : next))
        setLoading(false)
      })
    // Token refreshes fire this too; only react when the person actually changes. Only a real
    // sign-out clears you (a failed refresh while offline doesn't).
    const auth = supabase.auth.onAuthStateChange((event: string, session: any) =>
      setUser((prev: any) => {
        if (!session && event !== 'SIGNED_OUT') return prev
        return prev?.id === (session?.user?.id ?? undefined) ? prev : (session?.user ?? null)
      }),
    )
    return () => auth.data.subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (demo) return
    if (!user) {
      // Signed out: forget everything so the next person never sees stale data.
      setGroupsLoaded(false)
      setGroups([])
      setGroup(null)
      setPlaces([])
      setLists([])
      setHomeMeals([])
      setMembers([])
      return
    }
    supabase
      .from('group_members')
      .select('groups(*)')
      .eq('user_id', user.id)
      .then(({ data, error }: any) => {
        let list = orderSpaces((data ?? []).map((row: any) => row.groups).filter(Boolean) as Group[])
        // #166 offline: use the groups saved on this phone last time
        if (error && (isOffline() || isNetworkError(error)))
          list = cachedGroup<{ groups: Group[] }>('groups')?.groups ?? []
        else if (error) toast.error(error.message)
        else cacheGroup('groups', { groups: list })
        setGroups(list)
        const saved = localStorage.getItem('crumbs-group')
        setGroup((current) => current ?? list.find((g) => g.id === saved) ?? list[0] ?? null)
        setGroupsLoaded(true)
      })
  }, [user, supabase])
  const groupIdRef = useRef<string | null>(null)
  useEffect(() => {
    loadedOnce.current = false
    groupIdRef.current = group?.id ?? null
    if (group) localStorage.setItem('crumbs-group', group.id)
  }, [group])
  useEffect(() => {
    // E16 (Round 77): show the copy saved on this phone straight away while the live data loads
    // (it replaces the copy a moment later), instead of skeletons until every request is back.
    if (group && !demo && !loadedOnce.current && liveFor.current !== group.id) {
      const id = group.id
      readCachedGroup<any>(id).then((copy) => {
        if (!copy || loadedOnce.current || id !== groupIdRef.current || liveFor.current === id) return
        setPlaces(copy.places ?? [])
        setLists(copy.lists ?? [])
        setMembers(copy.members ?? [])
        setHomeMeals(copy.homeMeals ?? [])
        setV4(!!copy.v4)
        setLoading(false)
      })
    }
    load().catch(async (error) => {
      console.error(error)
      // #166 no signal: show the copy saved on this phone (read-only, edits become drafts)
      const copy = group ? await readCachedGroup<any>(group.id) : null
      if (copy && (isOffline() || isNetworkError(error))) {
        setPlaces(copy.places ?? [])
        setLists(copy.lists ?? [])
        setMembers(copy.members ?? [])
        setHomeMeals(copy.homeMeals ?? [])
        setV4(!!copy.v4)
        setOfflineCopy(copy.at)
      } else toast.error(error?.message || 'Could not load your places')
      setLoading(false)
    })
  }, [load])
  // Many realtime events can arrive at once (one rating = several rows); reload once.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // While the app is in the background, changes just mark it stale; one reload on return.
  const stale = useRef(false)
  // E1–E3 (Round 77): places that changed since the last flush ('all' = reload the group).
  const changed = useRef<Set<string> | 'all'>(new Set())
  const flush = useCallback(async () => {
    const pending = changed.current
    changed.current = new Set()
    const groupId = group?.id
    if (pending === 'all' || pending.size > MAX_PLACES_LIVE || !groupId) return loadRef.current()
    if (!pending.size) return
    const ids = [...pending]
    const [{ data, error }, spends] = await Promise.all([
      supabase.from('places').select(PLACE_SELECT).in('id', ids),
      user ? supabase.from('private_spends').select('visit_id,amount').eq('user_id', user.id) : { data: null, error: null },
    ])
    if (error) return loadRef.current()
    if (!spends.error && spends.data) privateSpends.current = spends.data as PrivateSpend[]
    setPlaces((current) =>
      mergePlaces(
        current,
        ids,
        withPrivateSpends(
          ((data ?? []) as Place[]).filter((p) => !pendingDeletes.has(p.id)),
          privateSpends.current,
        ),
        groupId,
      ),
    )
  }, [group?.id, supabase, user])
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])
  const scheduleLoad = useCallback((place?: string | null) => {
    const current = changed.current
    if (place === undefined || place === null || current === 'all') changed.current = 'all'
    else current.add(place)
    if (typeof document !== 'undefined' && document.hidden) {
      stale.current = true
      return
    }
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => {
      flushRef.current().catch((error) => console.error(error))
    }, 250)
  }, [])
  /** For the place tables: re-read just the place the change belongs to. */
  const placeChanged = useCallback(
    (table: string) => (payload: any) => scheduleLoad(placeOfChange(table, payload, placesRef.current)),
    [scheduleLoad],
  )
  useEffect(() => {
    const onShow = () => {
      if (document.hidden || !stale.current) return
      stale.current = false
      scheduleLoad(null)
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onShow)
      clearTimeout(reloadTimer.current)
    }
  }, [scheduleLoad])
  useEffect(() => {
    if (demo || !group) return
    const channel = supabase
      .channel(`crumbs-live-${group.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'places', filter: `group_id=eq.${group.id}` },
        placeChanged('places'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'place_ratings' }, placeChanged('place_ratings'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'place_visits' }, placeChanged('place_visits'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'place_facts' }, placeChanged('place_facts'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, placeChanged('dishes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dish_ratings' }, placeChanged('dish_ratings'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => scheduleLoad(null))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_places' }, () => scheduleLoad(null))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_meals', filter: `group_id=eq.${group.id}` },
        () => scheduleLoad(null),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_meal_shares', filter: `group_id=eq.${group.id}` },
        () => scheduleLoad(null),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_meal_ratings' },
        () => scheduleLoad(null),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_meal_cooks' },
        () => scheduleLoad(null),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${group.id}` },
        () => scheduleLoad(null),
      )
      // Group settings / look changed by the owner or an admin: apply straight away.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${group.id}` },
        (payload: any) => {
          const next = payload.new as Group
          setGroup((current) =>
            current && current.id === next.id ? { ...current, ...next } : current,
          )
          setGroups((current) =>
            current.map((item) => (item.id === next.id ? { ...item, ...next } : item)),
          )
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, scheduleLoad, placeChanged, supabase])

  const mutate = useCallback(
    async (work: () => Promise<any>) => {
      if (demo) return null
      const result = await work()
      if (result?.error) throw result.error
      await load()
      return result?.data
    },
    [load],
  )

  return {
    supabase,
    user,
    setUser,
    groups,
    setGroups,
    group,
    setGroup,
    places,
    setPlaces,
    lists,
    setLists,
    homeMeals,
    setHomeMeals,
    groupLocations,
    setGroupLocations,
    locationsReady,
    v4,
    members,
    setMembers,
    groupsLoaded,
    loading,
    demo,
    load,
    mutate,
    offlineCopy,
  }
}
