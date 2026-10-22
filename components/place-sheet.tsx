'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Dish, List, Place, Status } from '@/hooks/use-crumbs-data'
import { RatingStars } from './rating-stars'
import { Sheet } from './sheet'
import { placeAverage } from './place-card'
import { PlaceEditor } from './place-editor'
function DishRow({
  dish,
  userId,
  names,
  onRate,
  onNote,
  onRemove,
}: {
  dish: Dish
  userId?: string
  names: Record<string, string>
  onRate: (score: number) => void
  onNote: (note: string) => void
  onRemove: () => void
}) {
  const mine = dish.dish_ratings.find((rating) => rating.user_id === userId)
  const [note, setNote] = useState(mine?.notes ?? '')
  const [open, setOpen] = useState(false)
  const others = dish.dish_ratings.filter((rating) => rating.user_id !== userId)
  return (
    <div className="surface-soft flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {dish.name} {dish.is_ai_suggestion && <span className="tag">AI suggestion</span>}
          </p>
          {dish.description && <p className="text-sm text-muted-foreground">{dish.description}</p>}
          {dish.price !== null && dish.price !== undefined && (
            <p className="text-xs text-muted-foreground">~${Number(dish.price).toFixed(2)}</p>
          )}
        </div>
        <RatingStars label={dish.name} onChange={onRate} value={mine?.score ?? 0} />
      </div>
      {others.map((rating) => (
        <p className="text-sm" key={rating.user_id}>
          <strong>{names[rating.user_id] ?? 'Partner'}</strong>: {'★'.repeat(rating.score)}
          {rating.notes ? ` — ${rating.notes}` : ''}
        </p>
      ))}
      {open && (
        <textarea
          aria-label="Your note (what was it like?)"
          className="field min-h-16"
          autoFocus
          placeholder="Your note (what was it like?)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => onNote(note.trim())}
        />
      )}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <button className="underline" onClick={() => setOpen(!open)}>
          {open ? 'Hide note' : mine?.notes ? 'Edit note' : 'Add note'}
        </button>
        <button className="underline" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  )
}

export function PlaceSheet({
  place,
  userId,
  names = {},
  lists = [],
  onLists,
  demo,
  supabase,
  onClose,
  onUpdate,
  onDelete,
}: {
  place: Place
  userId?: string
  names?: Record<string, string>
  lists?: List[]
  onLists?: (lists: List[]) => void
  demo: boolean
  supabase: any
  onClose: () => void
  onUpdate: (place: Place) => void
  onDelete: () => void
}) {
  const mine = place.place_ratings.find((rating) => rating.user_id === userId)
  const [score, setScore] = useState(mine?.score ?? 0)
  const [notes, setNotes] = useState(mine?.notes ?? '')
  const [status, setStatus] = useState<Status>(place.status)
  const [saving, setSaving] = useState(false)
  const [dishName, setDishName] = useState('')
  const [dishes, setDishes] = useState(place.dishes ?? [])
  async function rate(next: number) {
    setScore(next)
    const optimistic = {
      ...place,
      place_ratings: [
        ...place.place_ratings.filter((rating) => rating.user_id !== userId),
        { user_id: userId!, score: next, notes },
      ],
    }
    onUpdate(optimistic)
    if (!demo) {
      const { error } = await supabase
        .from('place_ratings')
        .upsert({ place_id: place.id, user_id: userId, score: next, notes })
      if (error) toast.error(error.message)
    }
  }
  async function updateStatus(next: Status) {
    setStatus(next)
    const optimistic = { ...place, status: next }
    onUpdate(optimistic)
    if (!demo) {
      const { error } = await supabase.from('places').update({ status: next }).eq('id', place.id)
      if (error) toast.error(error.message)
    }
  }
  async function addDish() {
    if (!dishName.trim()) return
    setSaving(true)
    try {
      if (demo)
        setDishes((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            place_id: place.id,
            name: dishName.trim(),
            price: null,
            description: null,
            is_ai_suggestion: false,
            dish_ratings: [],
          },
        ])
      else {
        const { data, error } = await supabase
          .from('dishes')
          .insert({ place_id: place.id, name: dishName.trim(), created_by: userId })
          .select('*,dish_ratings(score,user_id,notes)')
          .single()
        if (error) throw error
        setDishes((current) => [...current, data])
      }
      setDishName('')
      toast.success('Dish added')
    } catch (error: any) {
      toast.error(error.message || 'Could not add dish')
    } finally {
      setSaving(false)
    }
  }
  async function suggestMenu() {
    setSaving(true)
    try {
      const response = await fetch('/api/suggest-menu', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: place.name, address: place.formatted_address }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (demo)
        setDishes((current) => [
          ...current,
          ...result.dishes.map((dish: any) => ({
            ...dish,
            id: crypto.randomUUID(),
            place_id: place.id,
            is_ai_suggestion: true,
            dish_ratings: [],
          })),
        ])
      else {
        const { data, error } = await supabase
          .from('dishes')
          .insert(
            result.dishes.map((dish: any) => ({
              ...dish,
              place_id: place.id,
              is_ai_suggestion: true,
              created_by: userId,
            })),
          )
          .select('*,dish_ratings(score,user_id,notes)')
        if (error) throw error
        setDishes((current) => [...current, ...(data ?? [])])
      }
      toast.success('Menu suggestions added')
    } catch (error: any) {
      toast.error(error.message || 'Could not suggest a menu')
    } finally {
      setSaving(false)
    }
  }
  async function toggleList(list: List) {
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
    onLists?.(
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
  async function rateDish(dishId: string, next: number) {
    setDishes((current) =>
      current.map((dish) =>
        dish.id === dishId
          ? {
              ...dish,
              dish_ratings: [
                ...dish.dish_ratings.filter((rating) => rating.user_id !== userId),
                { user_id: userId!, score: next, notes: null },
              ],
            }
          : dish,
      ),
    )
    if (demo) return
    const { error } = await supabase
      .from('dish_ratings')
      .upsert({ dish_id: dishId, user_id: userId, score: next })
    if (error) toast.error(error.message)
  }
  async function saveDishNote(dishId: string, note: string) {
    const dish = dishes.find((item) => item.id === dishId)
    const mineRating = dish?.dish_ratings.find((rating) => rating.user_id === userId)
    if (!mineRating) return toast('Give it a star rating first, then add a note')
    if ((mineRating.notes ?? '') === note) return
    setDishes((current) =>
      current.map((item) =>
        item.id === dishId
          ? {
              ...item,
              dish_ratings: item.dish_ratings.map((rating) =>
                rating.user_id === userId ? { ...rating, notes: note || null } : rating,
              ),
            }
          : item,
      ),
    )
    if (demo) return
    const { error } = await supabase
      .from('dish_ratings')
      .upsert({ dish_id: dishId, user_id: userId, score: mineRating.score, notes: note || null })
    if (error) toast.error(error.message)
  }
  async function removeDish(dishId: string) {
    setDishes((current) => current.filter((dish) => dish.id !== dishId))
    if (demo) return
    const { error } = await supabase.from('dishes').delete().eq('id', dishId)
    if (error) toast.error(error.message)
  }
  async function sharePlace() {
    const url =
      place.google_maps_url ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.formatted_address || ''}`)}`
    const text = `${place.name}${place.formatted_address ? `, ${place.formatted_address}` : ''}`
    try {
      if (navigator.share) await navigator.share({ title: place.name, text, url })
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        toast.success('Link copied')
      }
    } catch {
      // share sheet cancelled
    }
  }
  async function removePlace() {
    if (!window.confirm(`Delete ${place.name}?`)) return
    if (!demo) {
      const { error } = await supabase.from('places').delete().eq('id', place.id)
      if (error) return toast.error(error.message)
    }
    onDelete()
    toast.success('Place deleted')
  }
  return (
    <Sheet label={place.name} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-bold">{place.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {place.formatted_address || 'Address not added'}
          </p>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="mt-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Group average</p>
            <p className="font-serif text-5xl text-primary">
              {placeAverage(place) ? placeAverage(place).toFixed(1) : '—'}
            </p>
          </div>
          <RatingStars value={score} onChange={rate} label="Your rating" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['Been', 'Want to try'] as Status[]).map((item) => (
            <button
              aria-pressed={status === item}
              className={`chip ${status === item ? 'chip-active' : ''}`}
              key={item}
              onClick={() => updateStatus(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {lists.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-serif text-xl font-bold">Lists</h3>
            <div className="chip-row">
              {lists.map((list) => {
                const inList = list.list_places?.some((item) => item.place_id === place.id)
                return (
                  <button
                    key={list.id}
                    aria-pressed={!!inList}
                    className={`chip ${inList ? 'chip-active' : ''}`}
                    onClick={() => toggleList(list)}
                  >
                    {list.emoji} {list.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <PlaceEditor place={place} supabase={supabase} demo={demo} onUpdate={onUpdate} />
        <div className="flex flex-col gap-2">
          <h3 className="font-serif text-xl font-bold">Ratings</h3>
          {place.place_ratings.length ? (
            place.place_ratings.map((rating) => (
              <div className="surface-soft flex items-center justify-between" key={rating.user_id}>
                <span>
                  {rating.user_id === userId ? 'You' : (names[rating.user_id] ?? 'Partner')}
                </span>
                <span className="flex items-center gap-2">
                  <RatingStars value={rating.score} />
                  {rating.notes && (
                    <span className="text-xs text-muted-foreground">{rating.notes}</span>
                  )}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No ratings yet.</p>
          )}
          <textarea
            aria-label="Your notes"
            className="field min-h-20 text-base"
            placeholder="Your notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => score && rate(score)}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-bold">Dishes</h3>
            <button
              className="secondary !min-h-10 !px-3 text-sm"
              disabled={saving}
              onClick={suggestMenu}
            >
              {saving ? 'Thinking…' : 'Suggest menu'}
            </button>
          </div>
          {[...dishes]
            .sort(
              (a, b) =>
                b.dish_ratings.reduce((s, r) => s + r.score, 0) -
                a.dish_ratings.reduce((s, r) => s + r.score, 0),
            )
            .map((dish) => (
              <DishRow
                key={dish.id}
                dish={dish}
                userId={userId}
                names={names}
                onRate={(next) => rateDish(dish.id, next)}
                onNote={(note) => saveDishNote(dish.id, note)}
                onRemove={() => removeDish(dish.id)}
              />
            ))}
          <div className="flex gap-2">
            <input
              aria-label="Add a dish"
              onKeyDown={(event) => event.key === 'Enter' && addDish()}
              className="field"
              placeholder="Add a dish"
              value={dishName}
              onChange={(event) => setDishName(event.target.value)}
            />
            <button className="primary min-w-16" onClick={addDish}>
              Add
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            className="secondary flex-1 text-center"
            href={
              place.google_maps_url ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.formatted_address || ''}`)}`
            }
            target="_blank"
          >
            Directions
          </a>
          <button className="secondary" onClick={sharePlace}>
            Share
          </button>
          <button className="secondary text-destructive" onClick={removePlace}>
            Delete
          </button>
        </div>
      </div>
    </Sheet>
  )
}
