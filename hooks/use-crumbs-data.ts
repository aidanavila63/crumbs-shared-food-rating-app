'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { pendingDeletes } from '@/lib/undoable'
import { createClient } from '@/lib/supabase'

export type Status = 'Been' | 'Want to try'
export type Rating = { user_id: string; score: number; notes: string | null }
export type Dish = {
  id: string
  place_id: string
  name: string
  price: number | null
  description: string | null
  is_ai_suggestion: boolean
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
  tags: string[]
  created_at: string
  place_ratings: Rating[]
  dishes?: Dish[]
}
export type Group = { id: string; name: string; join_code: string; created_by: string }
export type Profile = { id: string; display_name: string; avatar_url: string | null }
export type List = {
  id: string
  group_id: string
  name: string
  emoji: string
  list_places?: { place_id: string }[]
}

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const demoUser = { id: 'demo-user', email: 'demo@crumbs.test' }
const demoGroup: Group = {
  id: 'demo-group',
  name: 'Maya & Jordan',
  join_code: 'CRUMBS',
  created_by: demoUser.id,
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
]

export function useCrumbsData() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<any>(demo ? demoUser : null)
  const [groups, setGroups] = useState<Group[]>(demo ? [demoGroup] : [])
  const [group, setGroup] = useState<Group | null>(demo ? demoGroup : null)
  const [places, setPlaces] = useState<Place[]>(demo ? demoPlaces : [])
  const [lists, setLists] = useState<List[]>([])
  const [members, setMembers] = useState<Profile[]>([])
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
            '*,place_ratings(score,user_id,notes),dishes(*,dish_ratings(score,user_id,notes))',
          )
          .eq('group_id', group.id)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('lists').select('*,list_places(place_id)').eq('group_id', group.id),
      ])
    if (placesError) throw placesError
    if (listsError) throw listsError
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
    const ids = (memberRows ?? []).map((row: any) => row.user_id)
    let profileRows: Profile[] = []
    if (ids.length) {
      const { data: rows } = await supabase
        .from('profiles')
        .select('id,display_name,avatar_url')
        .in('id', ids)
      profileRows = (rows ?? []) as Profile[]
    }
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
      setMembers([])
      return
    }
    supabase
      .from('group_members')
      .select('groups(id,name,join_code,created_by)')
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dish_ratings' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_places' }, scheduleLoad)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [group, scheduleLoad, supabase])

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
    members,
    groupsLoaded,
    loading,
    demo,
    load,
    mutate,
  }
}
