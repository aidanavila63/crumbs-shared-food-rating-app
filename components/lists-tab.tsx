'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { List, Place } from '@/hooks/use-crumbs-data'
export function ListsTab({
  lists,
  places,
  userId,
  groupId,
  demo,
  supabase,
  onLists,
}: {
  lists: List[]
  places: Place[]
  userId?: string
  groupId?: string
  demo: boolean
  supabase: any
  onLists: (lists: List[]) => void
}) {
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
  async function remove(list: List) {
    if (!window.confirm(`Delete ${list.name}?`)) return
    if (!demo) {
      const { error } = await supabase.from('lists').delete().eq('id', list.id)
      if (error) return toast.error(error.message)
    }
    onLists(lists.filter((item) => item.id !== list.id))
    setActiveId(null)
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
            aria-label="Date night"
            className="field"
            placeholder="Date night"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="field w-16 text-center"
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
      {active ? (
        <div className="surface">
          <button className="text-sm text-primary" onClick={() => setActiveId(null)}>
            Back to lists
          </button>
          <h2 className="mt-3 font-serif text-2xl font-bold">
            {active.emoji} {active.name}
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {places.map((place) => (
              <button
                className="surface-soft flex min-h-11 items-center justify-between text-left"
                key={place.id}
                onClick={() => toggle(active, place)}
              >
                <span>{place.name}</span>
                <span>
                  {active.list_places?.some((item) => item.place_id === place.id) ? 'Added' : 'Add'}
                </span>
              </button>
            ))}
          </div>
          <button className="mt-5 text-sm text-destructive" onClick={() => remove(active)}>
            Delete list
          </button>
        </div>
      ) : (
        lists.map((list) => (
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
