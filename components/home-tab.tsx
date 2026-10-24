'use client'
// #77 Home cooking: meals you make yourselves, kept apart from restaurants.
import { useMemo, useState } from 'react'
import { ChefHat, Dices, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { HomeMeal, Profile } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { undoableDelete } from '@/lib/undoable'
import { RatingStars } from './rating-stars'
import { PhotoButton } from './photo-button'
import { ReactionBar, timeAgo } from './social'
import { Sheet } from './sheet'

const DIETARY = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free']
const today = () => new Date().toISOString().slice(0, 10)

export const mealAverage = (meal: HomeMeal) =>
  meal.home_meal_ratings.length
    ? meal.home_meal_ratings.reduce((sum, r) => sum + r.score, 0) / meal.home_meal_ratings.length
    : 0
const lastCooked = (meal: HomeMeal) =>
  meal.home_meal_cooks
    .map((cook) => cook.cooked_on)
    .sort()
    .at(-1) ?? null

function safeUrl(url: string | null) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null
  } catch {
    return null
  }
}

export function HomeTab({
  meals,
  setMeals,
  groupId,
  userId,
  names,
  members,
  supabase,
  demo,
  v4,
}: {
  meals: HomeMeal[]
  setMeals: (update: (current: HomeMeal[]) => HomeMeal[]) => void
  groupId: string
  userId?: string
  names: Record<string, string>
  members: Profile[]
  supabase: any
  demo: boolean
  v4: boolean
}) {
  const [filter, setFilter] = useState<'All' | 'Cooked' | 'Want to cook'>('All')
  const [sort, setSort] = useState<'Newest' | 'Top rated' | 'Cooked lately'>('Newest')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<HomeMeal['status']>('Cooked')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = meals.find((meal) => meal.id === openId) ?? null

  const shown = useMemo(() => {
    const list = meals.filter((meal) => filter === 'All' || meal.status === filter)
    if (sort === 'Top rated') return [...list].sort((a, b) => mealAverage(b) - mealAverage(a))
    if (sort === 'Cooked lately')
      return [...list].sort((a, b) => (lastCooked(b) ?? '').localeCompare(lastCooked(a) ?? ''))
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [meals, filter, sort])

  if (!v4 && !demo)
    return (
      <div className="surface flex flex-col items-center gap-2 text-center">
        <ChefHat size={36} className="text-primary" />
        <h3 className="font-serif text-2xl font-bold">Home cooking</h3>
        <p className="text-sm text-muted-foreground">
          Log the meals you cook together, rate them and remember the recipes. This unlocks once the
          one-time database update has been run in Supabase.
        </p>
      </div>
    )

  async function add() {
    if (!name.trim() || !userId) return
    setBusy(true)
    try {
      let meal: HomeMeal = {
        id: crypto.randomUUID(),
        group_id: groupId,
        name: name.trim(),
        status,
        verdict: null,
        recipe_url: null,
        notes: null,
        photo_path: null,
        dietary: [],
        spice: null,
        created_by: userId,
        created_at: new Date().toISOString(),
        home_meal_ratings: [],
        home_meal_cooks: [],
      }
      if (!demo) {
        const { data, error } = await supabase
          .from('home_meals')
          .insert({ group_id: groupId, name: meal.name, status, created_by: userId })
          .select(
            '*,home_meal_ratings(user_id,score,notes),home_meal_cooks(id,meal_id,cooked_on,cooked_by)',
          )
          .single()
        if (error) throw error
        meal = data
      }
      if (status === 'Cooked') {
        const cook = await logCook(meal, true)
        if (cook) meal = { ...meal, home_meal_cooks: [cook] }
      }
      setMeals((current) => [meal, ...current])
      haptic('success')
      setName('')
      setAdding(false)
      setOpenId(meal.id)
    } catch (error: any) {
      toast.error(error?.message || 'Could not add that meal')
    } finally {
      setBusy(false)
    }
  }

  async function logCook(meal: HomeMeal, quiet = false) {
    const row = {
      id: crypto.randomUUID(),
      meal_id: meal.id,
      cooked_on: today(),
      cooked_by: userId ?? null,
    }
    if (demo) return row
    const { data, error } = await supabase
      .from('home_meal_cooks')
      .insert({ meal_id: meal.id, cooked_on: row.cooked_on, cooked_by: userId, created_by: userId })
      .select('id,meal_id,cooked_on,cooked_by')
      .single()
    if (error) {
      if (!quiet) toast.error(error.message)
      return null
    }
    return data
  }

  function surprise() {
    const pool = meals.filter((meal) => meal.verdict !== 'never')
    const wish = pool.filter((meal) => meal.status === 'Want to cook')
    const pick = (wish.length ? wish : pool)[
      Math.floor(Math.random() * (wish.length ? wish : pool).length)
    ]
    if (!pick) return toast('Add a few meals first')
    haptic('celebrate')
    setOpenId(pick.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button className="secondary flex-1" onClick={surprise}>
          <Dices size={18} /> What should we cook?
        </button>
        <button
          className="primary size-12 shrink-0"
          aria-label="Add a meal"
          onClick={() => setAdding(!adding)}
        >
          <Plus className={`transition-transform ${adding ? 'rotate-45' : ''}`} />
        </button>
      </div>
      {adding && (
        <div className="surface rise-panel flex flex-col gap-3">
          <input
            autoFocus
            className="field"
            aria-label="Meal name"
            placeholder="What did you make? (e.g. Sunday lasagna)"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && add()}
          />
          <div className="flex gap-2">
            {(['Cooked', 'Want to cook'] as const).map((item) => (
              <button
                key={item}
                aria-pressed={status === item}
                className={`chip ${status === item ? 'chip-active' : ''}`}
                onClick={() => setStatus(item)}
              >
                {item === 'Cooked' ? 'We made it' : 'Want to cook'}
              </button>
            ))}
            <button className="primary ml-auto" disabled={busy || !name.trim()} onClick={add}>
              Add
            </button>
          </div>
        </div>
      )}
      <div className="chip-row">
        {(['All', 'Cooked', 'Want to cook'] as const).map((item) => (
          <button
            key={item}
            aria-pressed={filter === item}
            className={`chip ${filter === item ? 'chip-active' : ''}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="chip-row">
        {(['Newest', 'Top rated', 'Cooked lately'] as const).map((item) => (
          <button
            key={item}
            aria-pressed={sort === item}
            className={`chip chip-sm ${sort === item ? 'chip-active' : ''}`}
            onClick={() => setSort(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="stagger flex flex-col gap-3">
          {shown.map((meal) => {
            const avg = mealAverage(meal)
            const last = lastCooked(meal)
            return (
              <button
                key={meal.id}
                type="button"
                className="surface flex w-full flex-col gap-2 text-left transition-transform active:scale-[.99]"
                aria-label={`Open ${meal.name}`}
                onClick={() => setOpenId(meal.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-serif text-2xl font-bold">{meal.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {meal.home_meal_cooks.length
                        ? `Made ${meal.home_meal_cooks.length}× · last ${timeAgo(`${last}T12:00:00`)}`
                        : 'Not made yet'}
                      {meal.verdict === 'again'
                        ? ' · 👍 make again'
                        : meal.verdict === 'never'
                          ? ' · 👎 never again'
                          : ''}
                    </p>
                  </div>
                  <strong className="font-serif text-3xl leading-8 text-primary">
                    {avg ? avg.toFixed(1) : '—'}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`chip chip-sm ${meal.status === 'Cooked' ? 'chip-active' : ''}`}>
                    {meal.status}
                  </span>
                  <RatingStars value={Math.round(avg)} />
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="surface flex flex-col items-center gap-2 text-center">
          <ChefHat size={36} className="text-primary" />
          <p className="font-semibold">
            {meals.length ? 'Nothing here yet.' : 'No home meals yet.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Add the things you cook together and the ones you want to try making.
          </p>
        </div>
      )}
      {open && (
        <MealSheet
          meal={open}
          userId={userId}
          names={names}
          members={members}
          groupId={groupId}
          supabase={supabase}
          demo={demo}
          onClose={() => setOpenId(null)}
          onUpdate={(next) =>
            setMeals((current) => current.map((m) => (m.id === next.id ? next : m)))
          }
          onCook={async () => {
            const cook = await logCook(open)
            if (!cook) return
            haptic('success')
            toast.success('Logged — nice cooking!')
            setMeals((current) =>
              current.map((m) =>
                m.id === open.id
                  ? { ...m, status: 'Cooked', home_meal_cooks: [...m.home_meal_cooks, cook] }
                  : m,
              ),
            )
            if (open.status !== 'Cooked' && !demo)
              await supabase.from('home_meals').update({ status: 'Cooked' }).eq('id', open.id)
          }}
          onDelete={() => {
            const removed = open
            setOpenId(null)
            undoableDelete({
              id: removed.id,
              message: `Deleted ${removed.name}`,
              hide: () => setMeals((current) => current.filter((m) => m.id !== removed.id)),
              restore: () => setMeals((current) => [removed, ...current]),
              commit: async () => {
                if (demo) return null
                const { error } = await supabase.from('home_meals').delete().eq('id', removed.id)
                return error
              },
            })
          }}
        />
      )}
    </div>
  )
}

function MealSheet({
  meal,
  userId,
  names,
  groupId,
  supabase,
  demo,
  onClose,
  onUpdate,
  onCook,
  onDelete,
}: {
  meal: HomeMeal
  userId?: string
  names: Record<string, string>
  members: Profile[]
  groupId: string
  supabase: any
  demo: boolean
  onClose: () => void
  onUpdate: (meal: HomeMeal) => void
  onCook: () => void
  onDelete: () => void
}) {
  const mine = meal.home_meal_ratings.find((r) => r.user_id === userId)
  const [note, setNote] = useState(mine?.notes ?? '')
  const [recipe, setRecipe] = useState(meal.recipe_url ?? '')
  const [notes, setNotes] = useState(meal.notes ?? '')
  const avg = mealAverage(meal)
  const link = safeUrl(meal.recipe_url)

  async function save(changes: Partial<HomeMeal>) {
    const before = meal
    onUpdate({ ...meal, ...changes })
    if (demo) return true
    const { error } = await supabase.from('home_meals').update(changes).eq('id', meal.id)
    if (error) {
      onUpdate(before)
      toast.error(error.message)
      return false
    }
    return true
  }

  async function rate(score: number, notesText = note) {
    if (!userId) return
    const row = { user_id: userId, score, notes: notesText.trim() || null }
    onUpdate({
      ...meal,
      home_meal_ratings: [...meal.home_meal_ratings.filter((r) => r.user_id !== userId), row],
    })
    if (demo) return
    const { error } = await supabase
      .from('home_meal_ratings')
      .upsert({ meal_id: meal.id, ...row, updated_at: new Date().toISOString() })
    if (error) toast.error(error.message)
  }

  return (
    <Sheet label={meal.name} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">🏠 Home cooking</p>
          <h2 className="font-serif text-3xl font-bold">{meal.name}</h2>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="mt-5 flex flex-col gap-5">
        <PhotoButton
          label={meal.name}
          path={meal.photo_path}
          groupId={groupId}
          supabase={supabase}
          demo={demo}
          onChange={(path) => save({ photo_path: path })}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">Group average</p>
            <p className="font-serif text-5xl text-primary">{avg ? avg.toFixed(1) : '—'}</p>
          </div>
          <RatingStars
            value={mine?.score ?? 0}
            onChange={(score) => rate(score)}
            label="Your rating"
          />
        </div>
        <button className="primary" onClick={onCook}>
          🍳 We made it today
        </button>
        <div className="chip-row">
          {(['Cooked', 'Want to cook'] as const).map((item) => (
            <button
              key={item}
              aria-pressed={meal.status === item}
              className={`chip ${meal.status === item ? 'chip-active' : ''}`}
              onClick={() => save({ status: item })}
            >
              {item}
            </button>
          ))}
          {(['again', 'never'] as const).map((kind) => (
            <button
              key={kind}
              aria-pressed={meal.verdict === kind}
              className={`chip ${meal.verdict === kind ? 'chip-active' : ''}`}
              onClick={() => save({ verdict: meal.verdict === kind ? null : kind })}
            >
              {kind === 'again' ? '👍 Make again' : '👎 Never again'}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-serif text-xl font-bold">Recipe</h3>
          {link && (
            <a
              className="text-sm font-semibold text-primary underline"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open recipe on {link.hostname.replace(/^www\./, '')}
            </a>
          )}
          <input
            className="field"
            aria-label="Recipe link"
            inputMode="url"
            placeholder="Paste a recipe link (optional)"
            value={recipe}
            onChange={(event) => setRecipe(event.target.value)}
            onBlur={() => {
              const clean = recipe.trim()
              if (clean === (meal.recipe_url ?? '')) return
              if (clean && !safeUrl(clean)) return toast.error('That doesn’t look like a web link')
              save({ recipe_url: clean || null })
            }}
          />
          <textarea
            className="field min-h-20"
            aria-label="Recipe notes"
            placeholder="Tweaks, swaps, what to do differently next time…"
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() =>
              notes.trim() !== (meal.notes ?? '') && save({ notes: notes.trim() || null })
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {DIETARY.map((item) => {
            const on = meal.dietary.includes(item)
            return (
              <button
                key={item}
                aria-pressed={on}
                className={`chip chip-sm ${on ? 'chip-active' : ''}`}
                onClick={() =>
                  save({
                    dietary: on ? meal.dietary.filter((d) => d !== item) : [...meal.dietary, item],
                  })
                }
              >
                {item}
              </button>
            )
          })}
          {[1, 2, 3].map((level) => (
            <button
              key={level}
              aria-pressed={meal.spice === level}
              className={`chip chip-sm ${meal.spice === level ? 'chip-active' : ''}`}
              onClick={() => save({ spice: meal.spice === level ? null : level })}
            >
              {'🌶️'.repeat(level)}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-serif text-xl font-bold">Ratings</h3>
          {meal.home_meal_ratings.length ? (
            meal.home_meal_ratings.map((rating) => (
              <div key={rating.user_id} className="surface-soft flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {rating.user_id === userId ? 'You' : (names[rating.user_id] ?? 'Partner')}
                  </span>
                  <RatingStars value={rating.score} />
                </div>
                {rating.notes && <p className="text-sm text-muted-foreground">{rating.notes}</p>}
                <ReactionBar target={`meal:${meal.id}:${rating.user_id}`} names={names} />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No ratings yet.</p>
          )}
          <textarea
            className="field min-h-16"
            aria-label="Your note"
            placeholder="Your note"
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => mine && note.trim() !== (mine.notes ?? '') && rate(mine.score, note)}
          />
        </div>
        {meal.home_meal_cooks.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="font-serif text-xl font-bold">Cooked</h3>
            {[...meal.home_meal_cooks]
              .sort((a, b) => b.cooked_on.localeCompare(a.cooked_on))
              .map((cook) => (
                <p key={cook.id} className="text-sm text-muted-foreground">
                  {new Date(`${cook.cooked_on}T12:00:00`).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {cook.cooked_by
                    ? ` · by ${cook.cooked_by === userId ? 'you' : (names[cook.cooked_by] ?? 'someone')}`
                    : ''}
                </p>
              ))}
          </div>
        )}
        <button className="secondary text-destructive" onClick={onDelete}>
          Delete meal
        </button>
      </div>
    </Sheet>
  )
}
