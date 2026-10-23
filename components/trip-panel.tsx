'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { List, Place } from '@/hooks/use-crumbs-data'
import { tripSummary } from '@/lib/goals'

/** Turn a list into a trip: a city, dates, a spend total, and a map of just its places. */
export function TripPanel({
  list,
  lists,
  places,
  supabase,
  demo,
  onLists,
  onShowOnMap,
}: {
  list: List
  lists: List[]
  places: Place[]
  supabase: any
  demo: boolean
  onLists: (lists: List[]) => void
  onShowOnMap: (listId: string) => void
}) {
  const isTrip = !!(list.trip_city || list.starts_on || list.ends_on)
  const [editing, setEditing] = useState(false)
  const [city, setCity] = useState(list.trip_city ?? '')
  const [starts, setStarts] = useState(list.starts_on ?? '')
  const [ends, setEnds] = useState(list.ends_on ?? '')
  const summary = tripSummary(list, places)

  async function save(changes: Partial<List>) {
    const before = lists
    onLists(lists.map((item) => (item.id === list.id ? { ...item, ...changes } : item)))
    if (demo) return
    const { error } = await supabase.from('lists').update(changes).eq('id', list.id)
    if (error) {
      onLists(before)
      toast.error(error.message)
    }
  }
  const apply = async () => {
    if (starts && ends && ends < starts) return toast.error('The end date is before the start date')
    await save({ trip_city: city.trim() || null, starts_on: starts || null, ends_on: ends || null })
    setEditing(false)
  }

  if (!isTrip && !editing)
    return (
      <button className="secondary mt-4 w-full" onClick={() => setEditing(true)}>
        ✈️ Turn into a trip
      </button>
    )
  if (editing)
    return (
      <div className="surface-soft mt-4 flex flex-col gap-2">
        <p className="font-semibold">Trip details</p>
        <input aria-label="City or destination" className="field" placeholder="City (Lisbon)" value={city} onChange={(event) => setCity(event.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            From
            <input className="field mt-1" type="date" value={starts} onChange={(event) => setStarts(event.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input className="field mt-1" type="date" value={ends} onChange={(event) => setEnds(event.target.value)} />
          </label>
        </div>
        <div className="flex gap-2">
          <button className="primary flex-1" onClick={apply}>
            Save trip
          </button>
          <button className="secondary" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
        {isTrip && (
          <button
            className="text-left text-sm text-destructive"
            onClick={async () => {
              await save({ trip_city: null, starts_on: null, ends_on: null })
              setCity('')
              setStarts('')
              setEnds('')
              setEditing(false)
            }}
          >
            Turn trip mode off
          </button>
        )}
      </div>
    )
  return (
    <div className="surface-soft mt-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">✈️ {list.trip_city || 'Trip'}</p>
          <p className="text-sm text-muted-foreground">
            {[list.starts_on && list.ends_on ? `${list.starts_on} → ${list.ends_on}` : list.starts_on ?? list.ends_on, summary.when].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button className="text-sm text-primary" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="surface !p-2">
          <p className="font-serif text-2xl text-primary">{summary.visited}/{summary.total}</p>
          <p className="text-xs text-muted-foreground">places done</p>
        </div>
        <div className="surface !p-2">
          <p className="font-serif text-2xl text-primary">${summary.spend.toFixed(summary.spend % 1 ? 2 : 0)}</p>
          <p className="text-xs text-muted-foreground">spent</p>
        </div>
        <div className="surface !p-2">
          <p className="font-serif text-2xl text-primary">{Math.max(summary.total - summary.visited, 0)}</p>
          <p className="text-xs text-muted-foreground">to go</p>
        </div>
      </div>
      <button className="secondary" onClick={() => onShowOnMap(list.id)}>
        🗺 Show on map
      </button>
    </div>
  )
}
