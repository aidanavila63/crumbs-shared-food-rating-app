'use client'
// #26 Food crawl planner: an ordered list of stops, walking times between them, one tap to walk
// it in Google Maps (a plain link, no API cost) or see it on the Crumbs map.
import { track } from '@/lib/analytics'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Footprints, Map as MapIcon, Plus, Shuffle, X } from 'lucide-react'
import { toast } from 'sonner'
import type { List, Place } from '@/hooks/use-crumbs-data'
import { crawlDirectionsUrl, crawlRoute, tidyRoute } from '@/lib/decide'
import { haptic } from '@/lib/motion'
import { distanceKm } from '@/lib/stats'
import { NearbyOffList, centreOf } from './nearby-off-list'

const ordered = (list: List) =>
  [...(list.list_places ?? [])].sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))

export function CrawlPlanner({
  lists,
  places,
  groupId,
  userId,
  supabase,
  demo,
  onLists,
  onOpenPlace,
  onShowOnMap,
  onPlaceAdded,
}: {
  /** a place saved from "Not on your list yet" (then added as a stop) */
  onPlaceAdded?: (place: Place) => void
  lists: List[]
  places: Place[]
  groupId: string
  userId?: string
  supabase: any
  demo: boolean
  onLists: (lists: List[]) => void
  onOpenPlace: (place: Place) => void
  onShowOnMap: (listId: string) => void
}) {
  const crawls = lists.filter((list) => list.kind === 'crawl')
  const [openId, setOpenId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const open = crawls.find((c) => c.id === openId) ?? null

  async function create() {
    const clean = name.trim()
    if (!clean) return
    let list: List = {
      id: crypto.randomUUID(),
      group_id: groupId,
      name: clean,
      emoji: '🚶',
      kind: 'crawl',
      list_places: [],
    }
    if (!demo) {
      const { data, error } = await supabase
        .from('lists')
        .insert({ group_id: groupId, name: clean, emoji: '🚶', kind: 'crawl', created_by: userId })
        .select('*,list_places(*)')
        .single()
      if (error) return toast.error(error.message)
      list = data
    }
    onLists([...lists, list])
    track('crawl_created')
    setName('')
    setOpenId(list.id)
    haptic('success')
  }

  /** Saves a new stop order (positions 0..n). */
  async function saveOrder(list: List, ids: string[]) {
    const before = lists
    onLists(
      lists.map((l) =>
        l.id === list.id
          ? { ...l, list_places: ids.map((place_id, position) => ({ place_id, position })) }
          : l,
      ),
    )
    if (demo) return
    const results = await Promise.all(
      ids.map((place_id, position) =>
        supabase.from('list_places').update({ position }).match({ list_id: list.id, place_id }),
      ),
    )
    const failed = results.find((r: any) => r.error)
    if (failed) {
      onLists(before)
      toast.error(failed.error.message)
    }
  }

  async function addStop(list: List, place: Place) {
    const ids = ordered(list).map((item) => item.place_id)
    if (ids.includes(place.id)) return
    if (!demo) {
      const { error } = await supabase
        .from('list_places')
        .insert({ list_id: list.id, place_id: place.id, added_by: userId, position: ids.length })
      if (error) return toast.error(error.message)
    }
    haptic('select')
    onLists(
      lists.map((l) =>
        l.id === list.id
          ? { ...l, list_places: [...ordered(l), { place_id: place.id, position: ids.length }] }
          : l,
      ),
    )
    setQuery('')
  }

  async function removeStop(list: List, placeId: string) {
    if (!demo) {
      const { error } = await supabase
        .from('list_places')
        .delete()
        .match({ list_id: list.id, place_id: placeId })
      if (error) return toast.error(error.message)
    }
    const rest = ordered(list)
      .map((item) => item.place_id)
      .filter((id) => id !== placeId)
    await saveOrder(list, rest)
  }

  async function removeCrawl(list: List) {
    if (!window.confirm(`Delete the crawl “${list.name}”?`)) return
    if (!demo) {
      const { error } = await supabase.from('lists').delete().eq('id', list.id)
      if (error) return toast.error(error.message)
    }
    onLists(lists.filter((l) => l.id !== list.id))
    setOpenId(null)
  }

  if (open) {
    const stops = ordered(open)
      .map((item) => places.find((p) => p.id === item.place_id))
      .filter((p): p is Place => !!p)
    return (
      <CrawlDetail
        crawl={open}
        stops={stops}
        places={places}
        query={query}
        onQuery={setQuery}
        onBack={() => setOpenId(null)}
        onAdd={(place) => addStop(open, place)}
        onRemove={(placeId) => removeStop(open, placeId)}
        onOrder={(ids) => saveOrder(open, ids)}
        onDelete={() => removeCrawl(open)}
        onOpenPlace={onOpenPlace}
        onShowOnMap={() => onShowOnMap(open.id)}
        nearby={
          onPlaceAdded ? (
            // After the first stop, suggestions centre on it (that's where the crawl is).
            <NearbyOffList
              center={
                stops[0]?.latitude != null && stops[0]?.longitude != null
                  ? { lat: stops[0].latitude, lng: stops[0].longitude }
                  : centreOf(places)
              }
              near={stops[0]?.name}
              auto={stops.length > 0}
              places={places}
              supabase={supabase}
              demo={demo}
              groupId={groupId}
              userId={userId}
              addLabel="Add stop"
              onAdded={(place) => {
                onPlaceAdded(place)
                addStop(open, place)
              }}
            />
          ) : null
        }
      />
    )
  }

  return (
    <div className="stagger flex flex-col gap-4">
      <div className="surface flex flex-col gap-3">
        <h3 className="font-serif text-2xl font-bold">New crawl</h3>
        <p className="text-sm text-muted-foreground">
          A few stops in a row — tacos, then dessert, then drinks. Crumbs works out the walk.
        </p>
        <div className="flex gap-2">
          <input
            className="field"
            aria-label="Crawl name"
            placeholder="e.g. Kensington taco crawl"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && create()}
          />
          <button className="primary shrink-0" disabled={!name.trim()} onClick={create}>
            Create
          </button>
        </div>
      </div>
      {crawls.map((crawl) => {
        const stops = ordered(crawl)
          .map((item) => places.find((p) => p.id === item.place_id))
          .filter((p): p is Place => !!p)
        const route = crawlRoute(stops)
        return (
          <button
            key={crawl.id}
            className="surface flex flex-col gap-1 text-left"
            onClick={() => setOpenId(crawl.id)}
          >
            <span className="font-serif text-2xl font-bold">🚶 {crawl.name}</span>
            <span className="text-sm text-muted-foreground">
              {stops.length} stop{stops.length === 1 ? '' : 's'}
              {route.minutes ? ` · ~${route.minutes} min walking` : ''}
            </span>
            {stops.length > 0 && (
              <span className="truncate text-sm">{stops.map((s) => s.name).join(' → ')}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CrawlDetail({
  crawl,
  stops,
  places,
  query,
  onQuery,
  onBack,
  onAdd,
  onRemove,
  onOrder,
  onDelete,
  onOpenPlace,
  onShowOnMap,
  nearby,
}: {
  nearby?: React.ReactNode
  crawl: List
  stops: Place[]
  places: Place[]
  query: string
  onQuery: (q: string) => void
  onBack: () => void
  onAdd: (place: Place) => void
  onRemove: (placeId: string) => void
  onOrder: (ids: string[]) => void
  onDelete: () => void
  onOpenPlace: (place: Place) => void
  onShowOnMap: () => void
}) {
  const route = crawlRoute(stops)
  const url = crawlDirectionsUrl(stops)
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase()
    // Nothing typed: places on your list close to the first stop (walkable from it).
    if (!needle) {
      const first = stops[0]
      if (first?.latitude == null || first?.longitude == null) return []
      const from = { lat: first.latitude, lng: first.longitude }
      return places
        .filter(
          (p) => !stops.some((s) => s.id === p.id) && p.latitude != null && p.longitude != null,
        )
        .map((p) => ({ p, km: distanceKm(from, { lat: p.latitude!, lng: p.longitude! }) }))
        .filter((x) => x.km <= 2)
        .sort((a, b) => a.km - b.km)
        .slice(0, 4)
        .map((x) => x.p)
    }
    return places
      .filter((p) => !stops.some((s) => s.id === p.id))
      .filter((p) => `${p.name} ${p.cuisine ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 6)
  }, [places, query, stops])
  const move = (index: number, by: number) => {
    const ids = stops.map((s) => s.id)
    const [item] = ids.splice(index, 1)
    ids.splice(index + by, 0, item)
    haptic('tap')
    onOrder(ids)
  }
  return (
    <div className="flex flex-col gap-4">
      <button className="self-start text-sm font-semibold text-primary underline" onClick={onBack}>
        ← All crawls
      </button>
      <div>
        <h3 className="font-serif text-3xl font-bold">🚶 {crawl.name}</h3>
        <p className="text-sm text-muted-foreground">
          {stops.length} stop{stops.length === 1 ? '' : 's'}
          {route.km > 0 ? ` · ${route.km.toFixed(1)} km · ~${route.minutes} min walking` : ''}
          {route.missing > 0
            ? ` · ${route.missing} leg${route.missing === 1 ? '' : 's'} without a map pin`
            : ''}
        </p>
      </div>
      <ol className="crawl-list flex flex-col">
        {stops.map((stop, index) => (
          <li key={stop.id} className="crawl-stop">
            {index > 0 && route.legs[index - 1] && (
              <span className="crawl-leg">
                <Footprints size={14} /> {route.legs[index - 1]!.minutes} min
              </span>
            )}
            <div className="surface-soft flex items-center gap-2">
              <span className="crawl-num">{index + 1}</span>
              <button
                className="min-w-0 flex-1 truncate text-left font-semibold"
                onClick={() => onOpenPlace(stop)}
              >
                {stop.name}
              </button>
              <button
                className="icon-btn !size-9"
                aria-label={`Move ${stop.name} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-btn !size-9"
                aria-label={`Move ${stop.name} down`}
                disabled={index === stops.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="icon-btn !size-9"
                aria-label={`Remove ${stop.name}`}
                onClick={() => onRemove(stop.id)}
              >
                <X size={16} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <input
          className="field"
          aria-label="Add a stop"
          placeholder="Add a stop from your places…"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {!query.trim() && options.length > 0 && (
          <p className="text-sm font-semibold">On your list, close to {stops[0]?.name}</p>
        )}
        {options.map((place) => (
          <button
            key={place.id}
            className="surface-soft flex items-center gap-2 text-left"
            onClick={() => onAdd(place)}
          >
            <Plus size={16} className="text-primary" />
            <span className="min-w-0 truncate font-semibold">{place.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{place.cuisine}</span>
          </button>
        ))}
      </div>
      {nearby}
      <div className="flex flex-wrap gap-2">
        {stops.length > 2 && (
          <button
            className="secondary flex-1 !min-h-10 text-sm"
            onClick={() => onOrder(tidyRoute(stops).map((s) => s.id))}
          >
            <Shuffle size={16} /> Shortest order
          </button>
        )}
        {stops.length > 0 && (
          <button className="secondary flex-1 !min-h-10 text-sm" onClick={onShowOnMap}>
            <MapIcon size={16} /> Show on map
          </button>
        )}
      </div>
      {url && (
        <a className="primary text-center" href={url} target="_blank" rel="noopener noreferrer">
          <Footprints size={18} /> Walking directions
        </a>
      )}
      <button className="secondary text-destructive" onClick={onDelete}>
        Delete crawl
      </button>
    </div>
  )
}
