'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { pendingDeletes } from '@/lib/undoable'
import { createClient } from '@/lib/supabase'
import type { Facts, Hours } from '@/lib/place-info'

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
export type GroupSettings = {
  scale?: '5' | 'half' | '10' // #2
  categories?: boolean // #1
  wouldReturn?: boolean // #3
  turns?: boolean // #37
  trips?: boolean // #29 (on unless false)
  home?: boolean // #77 (on unless false)
  weather?: boolean // #35 (on unless false)
  tags?: string[] // #8 preset vibe tags
}
export type Group = {
  id: string
  name: string
  join_code: string
  created_by: string
  settings?: GroupSettings | null
  emoji?: string | null
  color?: string | null
  /** #46 cover photo path in the photo bucket */
  cover_path?: string | null
}
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
  notify?: Record<string, boolean> | null
  /** Runs a restaurant page as its verified owner (which one is never shown). */
  restaurant_owner?: boolean | null
  /** #47 copy my ratings to my other groups that saved the same place */
  share_ratings?: 'group' | 'all' | 'ask'
  role?: 'owner' | 'admin' | 'member' | null
  /** #181 hottest spice that's fine (0-3, null = anything) */
  spice_max?: number | null
  /** #121 diet (Vegetarian, Vegan, Gluten-free…) and the Safe for me switch */
  diet?: string[] | null
  safe_for_me?: boolean | null
}
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
  // v4 = the 20261025 database update has been run. Until then new features stay hidden.
  const [v4, setV4] = useState(demo)
  const [loading, setLoading] = useState(!demo)
  const [groupsLoaded, setGroupsLoaded] = useState(demo)
  const loadedOnce = useRef(false)

  const load = useCallback(async () => {
    if (demo || !user || !group) return
    if (!loadedOnce.current) setLoading(true)
    const [{ data: placeRows, error: placesError }, { data: listRows, error: listsError }] =
      await Promise.all([
        supabase
          .from('places')
          .select(
            '*,place_ratings(*),place_visits(*),place_facts(*),dishes(*,dish_ratings(score,points,user_id,notes))',
          )
          .eq('group_id', group.id)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('lists').select('*,list_places(*)').eq('group_id', group.id),
      ])
    if (placesError) throw placesError
    if (listsError) throw listsError
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('user_id,role')
      .eq('group_id', group.id)
    const ids = (memberRows ?? []).map((row: any) => row.user_id)
    const roles = Object.fromEntries((memberRows ?? []).map((row: any) => [row.user_id, row.role]))
    let profileRows: Profile[] = []
    if (ids.length) {
      const { data: rows } = await supabase.from('profiles').select('*').in('id', ids)
      profileRows = ((rows ?? []) as Profile[]).map((row) => ({
        ...row,
        role: row.id === group.created_by ? 'owner' : (roles[row.id] ?? 'member'),
      }))
    }
    // Is the v4 database update in? (home_meals only exists after it.)
    const meals = await supabase
      .from('home_meals')
      .select(
        '*,home_meal_ratings(user_id,score,notes),home_meal_cooks(id,meal_id,cooked_on,cooked_by)',
      )
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
    setV4(!meals.error)
    setHomeMeals(meals.error ? [] : ((meals.data ?? []) as HomeMeal[]))
    setMembers(profileRows)
    setPlaces(((placeRows ?? []) as Place[]).filter((place) => !pendingDeletes.has(place.id)))
    setLists(((listRows ?? []) as List[]).filter((list) => !pendingDeletes.has(list.id)))
    loadedOnce.current = true
    setLoading(false)
  }, [group, supabase, user])

  useEffect(() => {
    if (demo) return
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUser((prev: any) => (prev?.id === data.user?.id ? prev : data.user))
        setLoading(false)
      })
      .catch(() => setLoading(false))
    // Token refreshes fire this too; only react when the person actually changes.
    const auth = supabase.auth.onAuthStateChange((_event, session) =>
      setUser((prev: any) =>
        prev?.id === (session?.user?.id ?? undefined) ? prev : (session?.user ?? null),
      ),
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
        if (error) toast.error(error.message)
        const list = (data ?? []).map((row: any) => row.groups).filter(Boolean) as Group[]
        setGroups(list)
        const saved = localStorage.getItem('crumbs-group')
        setGroup((current) => current ?? list.find((g) => g.id === saved) ?? list[0] ?? null)
        setGroupsLoaded(true)
      })
  }, [user, supabase])
  useEffect(() => {
    loadedOnce.current = false
    if (group) localStorage.setItem('crumbs-group', group.id)
  }, [group])
  useEffect(() => {
    load().catch((error) => {
      console.error(error)
      toast.error(error?.message || 'Could not load your places')
      setLoading(false)
    })
  }, [load])
  // Many realtime events can arrive at once (one rating = several rows); reload once.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scheduleLoad = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => {
      loadRef.current().catch((error) => console.error(error))
    }, 250)
  }, [])
  useEffect(() => () => clearTimeout(reloadTimer.current), [])
  useEffect(() => {
    if (demo || !group) return
    const channel = supabase
      .channel(`crumbs-live-${group.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'places', filter: `group_id=eq.${group.id}` },
        scheduleLoad,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'place_ratings' },
        scheduleLoad,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'place_visits' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'place_facts' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dish_ratings' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_places' }, scheduleLoad)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_meals', filter: `group_id=eq.${group.id}` },
        scheduleLoad,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_meal_ratings' },
        scheduleLoad,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_meal_cooks' },
        scheduleLoad,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${group.id}` },
        scheduleLoad,
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
  }, [group?.id, scheduleLoad, supabase])

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
    v4,
    members,
    setMembers,
    groupsLoaded,
    loading,
    demo,
    load,
    mutate,
  }
}
