'use client'
import { useShowScore } from './score-input'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { undoableDelete } from '@/lib/undoable'
import type { List, Place } from '@/hooks/use-crumbs-data'
import { ShareList } from './share-list'
import { TripPanel } from './trip-panel'
import { smartLists } from '@/lib/smart-lists'
import { haptic } from '@/lib/motion'
import { placeAverage } from './place-card'
export function ListsTab({
  lists,
  places,
  userId,
  groupId,
  demo,
  supabase,
  onLists,
  onShowOnMap,
  onSelect,
}: {
  lists: List[]
  places: Place[]
  userId?: string
  groupId?: string
  demo: boolean
  supabase: any
  onLists: (lists: List[]) => void
  onShowOnMap?: (listId: string) => void
  onSelect?: (place: Place) => void
}) {
  const show = useShowScore()
  const smart = useMemo(() => smartLists(places), [places])
  const [smartId, setSmartId] = useState<string | null>(null)
  const openSmart = smart.find((list) => list.id === smartId) ?? null
  const [listQuery, setListQuery] = useState('')
  const [onlyInList, setOnlyInList] = useState(false)
  const [order, setOrder] = useState<'Newest' | 'A–Z' | 'Biggest'>('Newest')
  const ordered = useMemo(() => {
    if (order === 'A–Z') return [...lists].sort((a, b) => a.name.localeCompare(b.name))
    if (order === 'Biggest')
      return [...lists].sort((a, b) => (b.list_places?.length ?? 0) - (a.list_places?.length ?? 0))
    return lists
  }, [lists, order])
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('♡')
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = lists.find((list) => list.id === activeId) ?? null
  async function create() {
    if (!name.trim()) return
    if (demo) {
      onLists([
        ...lists,
        { id: crypto.randomUUID(), group_id: groupId!, name, emoji, list_places: [] },
      ])
    } else {
      const { data, error } = await supabase
        .from('lists')
        .insert({ group_id: groupId, name: name.trim(), emoji, created_by: userId })
        .select('*,list_places(place_id)')
        .single()
      if (error) return toast.error(error.message)
      onLists([...lists, data])
    }
    setName('')
    toast.success('List created')
  }
  async function rename(list: List) {
    const next = window.prompt('Rename list', list.name)?.trim()
    if (!next || next === list.name) return
    if (!demo) {
      const { error } = await supabase.from('lists').update({ name: next }).eq('id', list.id)
      if (error) return toast.error(error.message)
    }
    onLists(lists.map((item) => (item.id === list.id ? { ...item, name: next } : item)))
  }
  function remove(list: List) {
    const before = lists
    undoableDelete({
      id: list.id,
      message: `Deleted ${list.name}`,
      hide: () => {
        onLists(lists.filter((item) => item.id !== list.id))
        setActiveId(null)
      },
      restore: () => onLists(before),
      commit: async () => {
        if (demo) return null
        const { error } = await supabase.from('lists').delete().eq('id', list.id)
        return error
      },
    })
  }
  async function toggle(list: List, place: Place) {
    const has = list.list_places?.some((item) => item.place_id === place.id)
    if (!demo) {
      const query = has
        ? supabase.from('list_places').delete().match({ list_id: list.id, place_id: place.id })
        : supabase
            .from('list_places')
            .insert({ list_id: list.id, place_id: place.id, added_by: userId })
      const { error } = await query
      if (error) return toast.error(error.message)
    }
    onLists(
      lists.map((item) =>
        item.id === list.id
          ? {
              ...item,
              list_places: has
                ? item.list_places?.filter((entry) => entry.place_id !== place.id)
                : [...(item.list_places ?? []), { place_id: place.id }],
            }
          : item,
      ),
    )
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="surface">
        <h2 className="font-serif text-2xl font-bold">Your lists</h2>
        <div className="mt-4 flex gap-2">
          <input
            aria-label="New list name"
            onKeyDown={(event) => event.key === 'Enter' && create()}
            className="field"
            placeholder="Date night"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="field field-emoji"
            aria-label="List emoji"
            value={emoji}
            maxLength={2}
            onChange={(event) => setEmoji(event.target.value)}
          />
          <button className="primary min-w-16" onClick={create}>
            Add
          </button>
        </div>
      </div>
      {!active && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Smart lists
          </p>
          <div className="smart-row">
            {smart.map((list) => (
              <button
                key={list.id}
                aria-pressed={smartId === list.id}
                className={`smart-card ${smartId === list.id ? 'smart-card-active' : ''}`}
                onClick={() => {
                  haptic('tap')
                  setSmartId(smartId === list.id ? null : list.id)
                }}
              >
                <span className="text-2xl" aria-hidden="true">
                  {list.emoji}
                </span>
                <span className="text-sm font-bold">{list.name}</span>
                <span className="text-xs text-muted-foreground">{list.places.length} places</span>
              </button>
            ))}
          </div>
          {openSmart && (
            <div key={openSmart.id} className="surface preview-pop flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{openSmart.hint}</p>
              {openSmart.places.length ? (
                openSmart.places.map((place) => (
                  <button
                    key={place.id}
                    className="surface-soft flex items-center justify-between gap-3 text-left"
                    onClick={() => onSelect?.(place)}
                  >
                    <span className="min-w-0 truncate font-semibold">{place.name}</span>
                    <span className="shrink-0 font-serif text-lg text-primary">
                      {show(placeAverage(place))}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nothing here yet.</p>
              )}
            </div>
          )}
        </div>
      )}
      {!active && lists.length > 1 && (
        <div className="chip-row">
          {(['Newest', 'A–Z', 'Biggest'] as const).map((item) => (
            <button
              key={item}
              aria-pressed={order === item}
              className={`chip chip-sm ${order === item ? 'chip-active' : ''}`}
              onClick={() => setOrder(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {active ? (
        <div className="surface">
          <button className="text-sm text-primary" onClick={() => setActiveId(null)}>
            Back to lists
          </button>
          <h2 className="mt-3 font-serif text-2xl font-bold">
            {active.emoji} {active.name}
          </h2>
          <TripPanel
            list={active}
            lists={lists}
            places={places}
            supabase={supabase}
            demo={demo}
            onLists={onLists}
            onShowOnMap={onShowOnMap ?? (() => {})}
          />
          <div className="mt-4 flex gap-2">
            <input
              className="field"
              aria-label="Search places for this list"
              placeholder="Search places"
              value={listQuery}
              onChange={(event) => setListQuery(event.target.value)}
            />
            <button
              aria-pressed={onlyInList}
              className={`chip shrink-0 ${onlyInList ? 'chip-active' : ''}`}
              onClick={() => setOnlyInList(!onlyInList)}
            >
              In list
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {[...places]
              .filter(
                (place) =>
                  (!onlyInList || active.list_places?.some((item) => item.place_id === place.id)) &&
                  `${place.name} ${place.cuisine ?? ''}`
                    .toLowerCase()
                    .includes(listQuery.trim().toLowerCase()),
              )
              .sort(
                (a, b) =>
                  Number(!!active.list_places?.some((item) => item.place_id === b.id)) -
                  Number(!!active.list_places?.some((item) => item.place_id === a.id)),
              )
              .map((place) => (
                <button
                  className="surface-soft flex min-h-11 items-center justify-between text-left"
                  key={place.id}
                  onClick={() => toggle(active, place)}
                >
                  <span>{place.name}</span>
                  <span>
                    {active.list_places?.some((item) => item.place_id === place.id)
                      ? 'Added'
                      : 'Add'}
                  </span>
                </button>
              ))}
          </div>
          <ShareList listId={active.id} userId={userId} supabase={supabase} demo={demo} />
          <div className="mt-5 flex gap-6 text-sm">
            <button className="text-primary" onClick={() => rename(active)}>
              Rename list
            </button>
            <button className="text-destructive" onClick={() => remove(active)}>
              Delete list
            </button>
          </div>
        </div>
      ) : (
        ordered.map((list) => (
          <button
            className="surface flex items-center justify-between text-left"
            key={list.id}
            onClick={() => setActiveId(list.id)}
          >
            <span className="text-2xl">{list.emoji}</span>
            <span className="flex-1 px-3">
              <strong>{list.name}</strong>
              <span className="block text-sm text-muted-foreground">
                {list.list_places?.length ?? 0} places
              </span>
            </span>
            <span>›</span>
          </button>
        ))
      )}
      {!lists.length && !active && (
        <div className="empty">
          <p className="font-serif text-xl font-bold">Make a list for your next craving</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep date nights, cheap eats, and brunch spots together.
          </p>
        </div>
      )}
    </section>
  )
}
