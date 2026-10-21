'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type Status = 'Been' | 'Want to try'
export type Rating = { user_id: string; score: number; notes: string | null }
export type Dish = { id: string; place_id: string; name: string; price: number | null; description: string | null; is_ai_suggestion: boolean; dish_ratings: Rating[] }
export type Place = { id: string; group_id: string; name: string; formatted_address: string | null; latitude: number | null; longitude: number | null; google_place_id: string; price_level: number | null; cuisine: string | null; website: string | null; google_maps_url: string | null; status: Status; pinned: boolean; tags: string[]; created_at: string; place_ratings: Rating[]; dishes?: Dish[] }
export type Group = { id: string; name: string; join_code: string; created_by: string }
export type Profile = { id: string; display_name: string; avatar_url: string | null }
export type List = { id: string; group_id: string; name: string; emoji: string; list_places?: { place_id: string }[] }

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const demoUser = { id: 'demo-user', email: 'demo@crumbs.test' }
const demoGroup: Group = { id: 'demo-group', name: 'Maya & Jordan', join_code: 'CRUMBS', created_by: demoUser.id }
const demoPlaces: Place[] = [{ id: 'demo-place', group_id: demoGroup.id, name: 'Saffron Table', formatted_address: '12 Market Street', latitude: 37.7749, longitude: -122.4194, google_place_id: 'demo-saffron', price_level: 2, cuisine: 'Mediterranean', website: null, google_maps_url: 'https://maps.google.com', status: 'Want to try', pinned: true, tags: ['date night'], created_at: new Date().toISOString(), place_ratings: [], dishes: [] }]

export function useCrumbsData() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<any>(demo ? demoUser : null)
  const [groups, setGroups] = useState<Group[]>(demo ? [demoGroup] : [])
  const [group, setGroup] = useState<Group | null>(demo ? demoGroup : null)
  const [places, setPlaces] = useState<Place[]>(demo ? demoPlaces : [])
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(!demo)

  const load = useCallback(async () => {
    if (demo || !user || !group) return
    setLoading(true)
    const [{ data: placeRows, error: placesError }, { data: listRows, error: listsError }] = await Promise.all([
      supabase.from('places').select('*,place_ratings(score,user_id,notes),dishes(*,dish_ratings(score,user_id,notes))').eq('group_id', group.id).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('lists').select('*,list_places(place_id)').eq('group_id', group.id),
    ])
    if (placesError) throw placesError
    if (listsError) throw listsError
    setPlaces((placeRows ?? []) as Place[])
    setLists((listRows ?? []) as List[])
    setLoading(false)
  }, [demo, group, supabase, user])

  useEffect(() => {
    if (demo) return
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false) }).catch(() => setLoading(false))
    const auth = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => auth.data.subscription.unsubscribe()
  }, [demo, supabase])

  useEffect(() => { load().catch(() => setLoading(false)) }, [load])
  useEffect(() => {
    if (demo || !group) return
    const channel = supabase.channel(`crumbs-live-${group.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'places', filter: `group_id=eq.${group.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'place_ratings' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dish_ratings' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_places' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [demo, group, load, supabase])

  const mutate = useCallback(async (work: () => Promise<any>) => {
    if (demo) return null
    const result = await work()
    if (result?.error) throw result.error
    await load()
    return result?.data
  }, [demo, load])

  return { supabase, user, setUser, groups, setGroups, group, setGroup, places, setPlaces, lists, setLists, loading, demo, load, mutate }
}
