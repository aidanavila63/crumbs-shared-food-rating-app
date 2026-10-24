'use client'
import { track } from '@/lib/analytics'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { pendingDeletes, undoableDelete } from '@/lib/undoable'
import type { Dish, Group, List, Place, Profile, Rating, Status } from '@/hooks/use-crumbs-data'
import { RatingStars } from './rating-stars'
import { ScoreDisplay, ScoreInput } from './score-input'
import { ReactionBar } from './social'
import {
  CATEGORIES,
  average5,
  balancedAverage,
  categoryAverages,
  formatScore,
  fromInput,
  inputValue,
  overallFromCategories,
  raterOffsets,
  settingsOf,
  type CategoryKey,
} from '@/lib/ratings'
import { haptic } from '@/lib/motion'
import { menuDishes, type MenuLine } from '@/lib/ocr-parse'
import { ReadPhotoButton } from './photo-reader'
import { MenuReview } from './menu-review'
import { PointsSlider } from './points-slider'
import { PhotoButton } from './photo-button'
import { VisitsPanel } from './visits-panel'
import { dishAverage, dishPoints } from '@/lib/stats'
import { ALLERGENS, dishWarnings, normaliseFacts, placeWarnings } from '@/lib/place-info'
import { PlaceHours } from './place-hours'
import { FactsEditor } from './facts-editor'
import { notifyMates } from '@/lib/push'
import { Sheet } from './sheet'
import { PlaceEditor } from './place-editor'
function DishRow({
  dish,
  userId,
  names,
  groupId,
  supabase,
  demo,
  members,
  onRate,
  onNote,
  onPhoto,
  onMeta,
  onRemove,
  v4 = false,
}: {
  dish: Dish
  userId?: string
  names: Record<string, string>
  groupId: string
  supabase: any
  demo: boolean
  onRate: (points: number) => void
  onNote: (note: string) => void
  members: Profile[]
  onPhoto: (path: string | null) => Promise<boolean>
  onMeta: (changes: DishMeta) => void
  onRemove: () => void
  v4?: boolean
}) {
  const mine = dish.dish_ratings.find((rating) => rating.user_id === userId)
  const [note, setNote] = useState(mine?.notes ?? '')
  const [open, setOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tag, setTag] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const warnings = dishWarnings(dish, members)
  const dietary = dish.dietary ?? []
  const tags = dish.tags ?? []
  function addTag(value: string) {
    const clean = value.trim().toLowerCase().slice(0, 20)
    if (clean && !tags.includes(clean)) onMeta({ tags: [...tags, clean] })
    setTag('')
  }
  const others = dish.dish_ratings.filter((rating) => rating.user_id !== userId)
  return (
    <div className="surface-soft flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {dish.name} {dish.is_ai_suggestion && <span className="tag">Auto-added</span>}
            {dish.wishlist && <span className="tag ml-1">⭐ Want to try</span>}
            {!!dish.spice && (
              <span className="ml-1" aria-label={`Spice ${dish.spice} of 3`}>
                {'🌶️'.repeat(dish.spice)}
              </span>
            )}
          </p>
          {dietary.length > 0 && (
            <p className="text-xs font-semibold text-[var(--success,#2f6b4a)]">{dietary.join(' · ')}</p>
          )}
          {dish.description && <p className="text-sm text-muted-foreground">{dish.description}</p>}
          {dish.price !== null && dish.price !== undefined && (
            <p className="text-xs text-muted-foreground">~${Number(dish.price).toFixed(2)}</p>
          )}
        </div>
      </div>
      <PointsSlider label={dish.name} value={mine ? dishPoints(mine) : null} onCommit={onRate} />
      <div className="flex flex-wrap items-center gap-2">
        {(['again', 'never'] as const).map((kind) => (
          <button
            key={kind}
            aria-pressed={dish.verdict === kind}
            className={`chip chip-sm ${dish.verdict === kind ? 'chip-active' : ''}`}
            onClick={() => onMeta({ verdict: dish.verdict === kind ? null : kind })}
          >
            {kind === 'again' ? '👍 Order again' : '👎 Never again'}
          </button>
        ))}
        {tags.map((item) => (
          <button
            key={item}
            className="tag"
            aria-label={`Remove tag ${item}`}
            onClick={() => onMeta({ tags: tags.filter((t) => t !== item) })}
          >
            {item} ×
          </button>
        ))}
        {warnings.map((warning) => (
          <span className="tag text-destructive" key={warning.label}>
            ⚠ {warning.label} · {warning.who.join(', ')} avoids
          </span>
        ))}
      </div>
      {tagsOpen && (
        <div className="flex flex-col gap-2">
          <input
            aria-label="Add a tag"
            className="field"
            placeholder="Tag (spicy, pizza, shareable…)"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && addTag(tag)}
            onBlur={() => addTag(tag)}
          />
          <div className="chip-row">
            {['spicy', 'shareable', 'vegetarian', 'dessert', 'drink', ...ALLERGENS.map((a) => a.toLowerCase())]
              .filter((item) => !tags.includes(item))
              .map((item) => (
                <button key={item} className="chip chip-sm" onClick={() => addTag(item)}>
                  + {item}
                </button>
              ))}
          </div>
        </div>
      )}
      {moreOpen && v4 && (
        <div className="dish-more flex flex-col gap-2">
          <div className="chip-row" role="group" aria-label="Course">
            {COURSES.map((course) => (
              <button
                key={course}
                aria-pressed={dish.course === course}
                className={`chip chip-sm ${dish.course === course ? 'chip-active' : ''}`}
                onClick={() => onMeta({ course: dish.course === course ? null : course })}
              >
                {COURSE_LABEL[course]}
              </button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label="Dietary">
            {DIETARY.map((item) => (
              <button
                key={item}
                aria-pressed={dietary.includes(item)}
                className={`chip chip-sm ${dietary.includes(item) ? 'chip-active' : ''}`}
                onClick={() =>
                  onMeta({
                    dietary: dietary.includes(item) ? dietary.filter((d) => d !== item) : [...dietary, item],
                  })
                }
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Spice</span>
            {[0, 1, 2, 3].map((level) => (
              <button
                key={level}
                aria-pressed={(dish.spice ?? 0) === level}
                className={`chip chip-sm ${(dish.spice ?? 0) === level ? 'chip-active' : ''}`}
                onClick={() => onMeta({ spice: level || null })}
              >
                {level ? '🌶️'.repeat(level) : 'None'}
              </button>
            ))}
            <button
              aria-pressed={!!dish.wishlist}
              className={`chip chip-sm ${dish.wishlist ? 'chip-active' : ''}`}
              onClick={() => onMeta({ wishlist: !dish.wishlist })}
            >
              ⭐ Want to try
            </button>
          </div>
        </div>
      )}
      {others.map((rating) => (
        <p className="text-sm" key={rating.user_id}>
          <strong>{names[rating.user_id] ?? 'Partner'}</strong>: {dishPoints(rating)}/100
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
      <PhotoButton
        compact
        label={dish.name}
        path={dish.photo_path}
        groupId={groupId}
        supabase={supabase}
        demo={demo}
        onChange={onPhoto}
      />
      <div className="flex gap-4 text-xs text-muted-foreground">
        <button className="underline" onClick={() => setOpen(!open)}>
          {open ? 'Hide note' : mine?.notes ? 'Edit note' : 'Add note'}
        </button>
        <button className="underline" onClick={() => setTagsOpen(!tagsOpen)}>
          {tagsOpen ? 'Done with tags' : 'Tags'}
        </button>
        {v4 && (
          <button className="underline" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
            {moreOpen ? 'Done' : 'Course & diet'}
          </button>
        )}
        <button className="underline" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  )
}

type DishMeta = Partial<Pick<Dish, 'verdict' | 'tags' | 'course' | 'dietary' | 'spice' | 'wishlist'>>
const COURSES = ['starter', 'main', 'side', 'dessert', 'drink'] as const
const COURSE_LABEL: Record<(typeof COURSES)[number], string> = {
  starter: 'Starters',
  main: 'Mains',
  side: 'Sides',
  dessert: 'Desserts',
  drink: 'Drinks',
}
const DIETARY = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal']
const RETURN = [
  { id: 'yes', label: '👍 Would go back' },
  { id: 'maybe', label: '🤷 Maybe' },
  { id: 'no', label: '👎 Once was enough' },
] as const

export function PlaceSheet({
  place,
  userId,
  names = {},
  members = [],
  lists = [],
  onLists,
  demo,
  supabase,
  onClose,
  onUpdate,
  onDelete,
  onRestore,
  group = null,
  v4 = false,
  allPlaces = [],
  menuImport = true,
}: {
  /** #109 admin switch */
  menuImport?: boolean
  group?: Group | null
  v4?: boolean
  /** Everyone's real ratings (for the balanced score). */
  allPlaces?: Place[]
  place: Place
  userId?: string
  names?: Record<string, string>
  members?: Profile[]
  lists?: List[]
  onLists?: (lists: List[]) => void
  demo: boolean
  supabase: any
  onClose: () => void
  onUpdate: (place: Place) => void
  onDelete: () => void
  onRestore: (place: Place) => void
}) {
  const mine = place.place_ratings.find((rating) => rating.user_id === userId)
  const [notes, setNotes] = useState(mine?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [dishName, setDishName] = useState('')
  const score = mine?.score ?? 0
  const s = settingsOf(group)
  const scale = v4 ? s.scale : '5'
  const status = place.status
  const [dishes, setDishes] = useState(place.dishes ?? [])
  const [menuDraft, setMenuDraft] = useState<MenuLine[] | null>(null)
  async function addMenuDishes(lines: MenuLine[]) {
    setMenuDraft(null)
    const rows = lines.map((line) => ({
      place_id: place.id,
      name: line.name.trim().slice(0, 120),
      price: line.price,
      description: line.description,
      is_ai_suggestion: false,
      created_by: userId,
    }))
    if (demo)
      setDishes((current) => [
        ...current,
        ...rows.map((row) => ({ ...row, id: crypto.randomUUID(), dish_ratings: [] })),
      ])
    else {
      const { data, error } = await supabase
        .from('dishes')
        .insert(rows)
        .select('*,dish_ratings(score,points,user_id,notes)')
      if (error) return toast.error(error.message)
      setDishes((current) => [...current, ...(data ?? [])])
    }
    haptic('success')
    toast.success(`Added ${rows.length} dish${rows.length === 1 ? '' : 'es'} from the menu photo`)
  }
  // Pick up a partner's dishes/ratings when the data reloads (skipping ones mid-undo).
  useEffect(() => {
    setDishes((place.dishes ?? []).filter((dish) => !pendingDeletes.has(dish.id)))
  }, [place.dishes])
  /** Saves your rating row with whatever changed (overall, categories, would-go-back, notes). */
  async function saveMine(changes: Partial<Rating>) {
    const next: Rating = { ...(mine ?? { user_id: userId!, score: 0, notes: null }), notes, ...changes, user_id: userId! }
    if (!next.score) {
      const fromCats = overallFromCategories(next)
      if (fromCats === null) return toast('Give it an overall score first')
      Object.assign(next, fromInput(fromCats, 'half'))
    }
    onUpdate({
      ...place,
      place_ratings: [...place.place_ratings.filter((rating) => rating.user_id !== userId), next],
    })
    if (demo) return
    const row: Record<string, unknown> = { place_id: place.id, user_id: userId, score: next.score, notes: next.notes }
    if (v4)
      Object.assign(row, {
        points: next.points ?? null,
        food: next.food ?? null,
        service: next.service ?? null,
        vibe: next.vibe ?? null,
        value: next.value ?? null,
        would_return: next.would_return ?? null,
      })
    const { error } = await supabase.from('place_ratings').upsert(row)
    if (error) toast.error(error.message)
    else if (next.score !== mine?.score) {
      track('rated', { scale, categories: CATEGORIES.some(({ key }) => next[key] != null) })
      notifyMates({ type: 'place_rating', placeId: place.id, value: next.score })
    }
  }
  const rate = (value: number) => saveMine(scale === '5' ? { score: value, points: null } : fromInput(value, scale))
  async function toggleVibe(tag: string) {
    haptic('select')
    const has = (place.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase())
    const tags = has
      ? place.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
      : [...(place.tags ?? []), tag]
    onUpdate({ ...place, tags })
    if (demo) return
    const { error } = await supabase.from('places').update({ tags }).eq('id', place.id)
    if (error) {
      onUpdate(place)
      toast.error(error.message)
    }
  }
  async function updateStatus(next: Status) {
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
          .select('*,dish_ratings(score,points,user_id,notes)')
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
  const importedStamp = dishes
    .filter((dish) => dish.is_ai_suggestion && dish.created_at)
    .map((dish) => dish.created_at as string)
    .sort()[0]
  const importedOn = importedStamp
    ? new Date(importedStamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  async function suggestMenu() {
    setSaving(true)
    try {
      const response = await fetch('/api/suggest-menu', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ placeId: place.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      const have = new Set(dishes.map((dish) => dish.name.trim().toLowerCase()))
      result.dishes = result.dishes.filter(
        (dish: any) => !have.has(String(dish.name).trim().toLowerCase()),
      )
      if (!result.dishes.length) {
        const why: Record<string, string> = {
          'no-website': 'No website saved for this place, so there is no menu to read.',
          unreadable: "Couldn't read their website. Add dishes yourself as you try them.",
          'no-menu': "Didn't find a menu on their website. Add dishes yourself as you try them.",
        }
        return toast(why[result.reason] ?? 'No new dishes to add')
      }
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
          .select('*,dish_ratings(score,points,user_id,notes)')
        if (error) throw error
        setDishes((current) => [...current, ...(data ?? [])])
      }
      toast.success('Added dishes from their website')
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
  async function rateDish(dishId: string, points: number) {
    const stars = Math.min(5, Math.max(1, Math.round(points / 20)))
    const dish = dishes.find((item) => item.id === dishId)
    setDishes((current) =>
      current.map((item) =>
        item.id === dishId
          ? {
              ...item,
              dish_ratings: [
                ...item.dish_ratings.filter((rating) => rating.user_id !== userId),
                {
                  user_id: userId!,
                  score: stars,
                  points,
                  notes: item.dish_ratings.find((r) => r.user_id === userId)?.notes ?? null,
                },
              ],
            }
          : item,
      ),
    )
    if (demo) return
    // Keep the old 1-5 `score` in step so older screens and the AI still understand it.
    const { error } = await supabase
      .from('dish_ratings')
      .upsert({ dish_id: dishId, user_id: userId, score: stars, points })
    if (error) return toast.error(error.message)
    if (dish)
      notifyMates({ type: 'dish_rating', placeId: place.id, dishName: dish.name, value: points })
  }
  async function setDishPhoto(dishId: string, path: string | null) {
    const before = dishes
    setDishes((current) =>
      current.map((item) => (item.id === dishId ? { ...item, photo_path: path } : item)),
    )
    const { error } = await supabase.from('dishes').update({ photo_path: path }).eq('id', dishId)
    if (error) {
      setDishes(before)
      toast.error(error.message)
      return false
    }
    return true
  }
  async function setDishMeta(dishId: string, changes: DishMeta) {
    const before = dishes
    setDishes((current) => current.map((item) => (item.id === dishId ? { ...item, ...changes } : item)))
    if (demo) return
    const { error } = await supabase.from('dishes').update(changes).eq('id', dishId)
    if (error) {
      setDishes(before)
      toast.error(error.message)
    }
  }
  async function setPlacePhoto(path: string | null) {
    const { error } = await supabase.from('places').update({ photo_path: path }).eq('id', place.id)
    if (error) {
      toast.error(error.message)
      return false
    }
    onUpdate({ ...place, photo_path: path })
    return true
  }
  async function saveDishNote(dishId: string, note: string) {
    const dish = dishes.find((item) => item.id === dishId)
    const mineRating = dish?.dish_ratings.find((rating) => rating.user_id === userId)
    if (!mineRating) return toast('Give it a score first, then add a note')
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
    const { error } = await supabase.from('dish_ratings').upsert({
      dish_id: dishId,
      user_id: userId,
      score: mineRating.score,
      points: mineRating.points ?? null,
      notes: note || null,
    })
    if (error) toast.error(error.message)
  }
  function removeDish(dishId: string) {
    const before = dishes
    const dish = dishes.find((item) => item.id === dishId)
    undoableDelete({
      id: dishId,
      message: `Removed ${dish?.name ?? 'dish'}`,
      hide: () => setDishes((current) => current.filter((item) => item.id !== dishId)),
      restore: () => setDishes(before),
      commit: async () => {
        if (demo) return null
        const { error } = await supabase.from('dishes').delete().eq('id', dishId)
        return error
      },
    })
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
  function removePlace() {
    const removed = place
    undoableDelete({
      id: removed.id,
      message: `Deleted ${removed.name}`,
      hide: onDelete,
      restore: () => onRestore(removed),
      commit: async () => {
        if (demo) return null
        const { error } = await supabase.from('places').delete().eq('id', removed.id)
        return error
      },
    })
  }
  const warnings = placeWarnings(normaliseFacts(place.place_facts), members)
  const order = dishes.filter(
    (dish) => dish.verdict === 'again' || (dish.verdict !== 'never' && (dishAverage(dish) ?? 0) >= 85),
  )
  const skip = dishes.filter((dish) => dish.verdict === 'never')
  const average = average5(place.place_ratings)
  const offsets = raterOffsets(allPlaces)
  const balancedRaw = place.place_ratings.length >= 2 ? balancedAverage(place.place_ratings, offsets) : 0
  const balanced = balancedRaw && Math.abs(balancedRaw - average) >= 0.05 ? balancedRaw : null
  const cats = categoryAverages(place.place_ratings)
  // #18 Dishes grouped by course once any dish has one; best-rated first inside each group.
  const sortedDishes = [...dishes].sort(
    (a, b) =>
      b.dish_ratings.reduce((sum, r) => sum + dishPoints(r), 0) -
      a.dish_ratings.reduce((sum, r) => sum + dishPoints(r), 0),
  )
  const dishGroups: [Dish['course'] | null, Dish[]][] = dishes.some((dish) => dish.course)
    ? [
        ...COURSES.map((course) => [course, sortedDishes.filter((dish) => dish.course === course)] as [Dish['course'], Dish[]]),
        [null, sortedDishes.filter((dish) => !dish.course)] as [null, Dish[]],
      ].filter(([, list]) => list.length)
    : [[null, sortedDishes]]
  return (
    <Sheet label={place.name} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-bold">{place.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {place.formatted_address || 'Address not added'}
          </p>
          <PlaceHours place={place} supabase={supabase} demo={demo} onUpdate={onUpdate} />
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="mt-5 flex flex-col gap-5">
        <PhotoButton
          label={place.name}
          path={place.photo_path}
          groupId={place.group_id}
          supabase={supabase}
          demo={demo}
          onChange={setPlacePhoto}
        />
        {warnings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {warnings.map((warning) => (
              <span className="tag text-destructive" key={warning.label}>
                ⚠ {warning.label} · {warning.who.join(', ')} avoids
              </span>
            ))}
          </div>
        )}
        {(order.length > 0 || skip.length > 0) && (
          <div className="surface-soft flex flex-col gap-1">
            <h3 className="font-serif text-xl font-bold">Dish highlights</h3>
            {order.map((dish) => (
              <p key={dish.id} className="text-sm">
                <span className="tag mr-1">MUST TRY</span> <strong>{dish.name}</strong>
                {dishAverage(dish) !== null ? ` · ${dishAverage(dish)}/100` : ''}
              </p>
            ))}
            {skip.map((dish) => (
              <p key={dish.id} className="text-sm text-muted-foreground">
                👎 Skip the {dish.name}
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">Group average</p>
            <p className="font-serif text-5xl text-primary">
              {formatScore(average, scale)}
              {scale === '10' && average > 0 && <span className="text-xl text-muted-foreground">/10</span>}
            </p>
            {balanced !== null && (
              <button
                className="text-xs text-muted-foreground underline decoration-dotted"
                onClick={() =>
                  toast('Balanced score', {
                    description:
                      'Adjusts for how each person usually rates, so a tough rater’s 4 counts like a generous rater’s 4.5.',
                  })
                }
              >
                Balanced: {formatScore(balanced, scale)}
              </button>
            )}
          </div>
          <ScoreInput value={inputValue(mine, scale)} scale={scale} onChange={rate} />
        </div>
        {v4 && s.categories && (
          <div className="surface-soft flex flex-col gap-1">
            {CATEGORIES.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="w-16 text-sm font-semibold">{label}</span>
                <RatingStars
                  value={mine?.[key] ?? 0}
                  label={`Your ${label.toLowerCase()} score`}
                  onChange={(value) => saveMine({ [key]: value } as Partial<Record<CategoryKey, number>>)}
                />
                <span className="w-10 text-right text-sm text-muted-foreground" aria-label={`Group ${label}`}>
                  {cats[key] !== null ? cats[key]!.toFixed(1) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
        {v4 && s.wouldReturn && (
          <div className="chip-row" role="group" aria-label="Would you go back?">
            {RETURN.map((item) => (
              <button
                key={item.id}
                aria-pressed={mine?.would_return === item.id}
                className={`chip chip-sm ${mine?.would_return === item.id ? 'chip-active' : ''}`}
                onClick={() => {
                  haptic('select')
                  saveMine({ would_return: mine?.would_return === item.id ? null : item.id })
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="chip-row" role="group" aria-label="Vibe tags">
          {[...new Set([...s.tags, ...(place.tags ?? [])])].map((tag) => {
            const on = (place.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase())
            return (
              <button
                key={tag}
                aria-pressed={on}
                className={`chip chip-sm ${on ? 'chip-active' : ''}`}
                onClick={() => toggleVibe(tag)}
              >
                {tag}
              </button>
            )
          })}
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
        {status === 'Been' && (
          <VisitsPanel
            place={place}
            userId={userId}
            supabase={supabase}
            demo={demo}
            onUpdate={onUpdate}
            v4={v4}
            scale={scale}
            members={members}
            names={names}
            turns={v4 && s.turns}
          />
        )}
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
        <FactsEditor place={place} supabase={supabase} demo={demo} userId={userId} onUpdate={onUpdate} />
        <PlaceEditor place={place} supabase={supabase} demo={demo} onUpdate={onUpdate} />
        <div className="flex flex-col gap-2">
          <h3 className="font-serif text-xl font-bold">Ratings</h3>
          {place.place_ratings.length ? (
            place.place_ratings.map((rating) => (
              <div className="surface-soft flex flex-col gap-1" key={rating.user_id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {rating.user_id === userId ? 'You' : (names[rating.user_id] ?? 'Partner')}
                  </span>
                  <ScoreDisplay rating={rating} scale={scale} />
                </div>
                {(rating.would_return || rating.notes) && (
                  <p className="text-sm text-muted-foreground">
                    {rating.would_return && (
                      <span className="tag mr-1">
                        {RETURN.find((item) => item.id === rating.would_return)?.label}
                      </span>
                    )}
                    {rating.notes}
                  </p>
                )}
                <ReactionBar target={`rating:${place.id}:${rating.user_id}`} names={names} />
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
            onBlur={() => score && (mine?.notes ?? '') !== notes && saveMine({})}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-bold">Dishes</h3>
            {menuImport && (
            <button
              className="secondary !min-h-10 !px-3 text-sm"
              disabled={saving}
              onClick={suggestMenu}
            >
              {saving ? 'Reading website…' : 'Import menu from website'}
            </button>
            )}
          </div>
          <ReadPhotoButton
            label="Menu photo"
            className="secondary self-start !min-h-10 !px-3 text-sm"
            onText={(text) => {
              const found = menuDishes(text)
              if (!found.length) return toast('Couldn’t spot dishes with prices — try a closer photo')
              setMenuDraft(found)
            }}
          />
          {menuDraft && (
            <MenuReview
              lines={menuDraft}
              existing={dishes.map((dish) => dish.name)}
              onCancel={() => setMenuDraft(null)}
              onSave={addMenuDishes}
            />
          )}
          {place.website && (
            <a
              className="text-sm font-semibold text-primary underline"
              href={place.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              {place.name} website: {websiteHost(place.website)}
            </a>
          )}
          {importedOn && (
            <p className="text-xs text-muted-foreground">
              Auto-added from their website on {importedOn}. Dishes and prices may have changed, so
              check the site.
            </p>
          )}
          {dishGroups.map(([course, group]) => [
            course && (
              <h4 key={`h-${course}`} className="mt-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {COURSE_LABEL[course]}
              </h4>
            ),
            ...group.map((dish) => (
              <DishRow
                v4={v4}
                key={dish.id}
                dish={dish}
                userId={userId}
                names={names}
                groupId={place.group_id}
                supabase={supabase}
                demo={demo}
                onRate={(next) => rateDish(dish.id, next)}
                members={members}
                onPhoto={(path) => setDishPhoto(dish.id, path)}
                onMeta={(changes) => setDishMeta(dish.id, changes)}
                onNote={(note) => saveDishNote(dish.id, note)}
                onRemove={() => removeDish(dish.id)}
              />
            )),
          ])}
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
            rel="noopener noreferrer"
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

function websiteHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'open site'
  }
}
