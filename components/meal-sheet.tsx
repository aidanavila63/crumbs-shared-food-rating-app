'use client'
// One home meal / recipe, in three modes:
// 📖 Read — a clean recipe to cook from (ingredients, steps, notes, how it's rated).
// 🍳 Log  — "we made it today", your rating and note, everyone's ratings, the times you made it.
// ✏️ Edit — name, kind, cuisine, ingredients (amount · measure · what), steps, link, photo, sharing.
import { useState } from 'react'
import { BookOpen, ChefHat, Pencil, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { HomeMeal, Ingredient, Place, Profile } from '@/hooks/use-crumbs-data'
import { dishAverage } from '@/lib/stats'
import { haptic } from '@/lib/motion'
import {
  CUISINES,
  MEAL_KINDS,
  UNITS,
  ingredientReady,
  ingredientText,
  mealAverage,
  safeUrl,
  stepsOf,
} from '@/lib/meals'
import { photoUrl } from '@/lib/photos'
import { RatingStars } from './rating-stars'
import { PhotoButton } from './photo-button'
import { ReactionBar } from './social'
import { Sheet } from './sheet'
import { Switch } from './switch'

const DIETARY = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free']
const blank = (): Ingredient => ({ qty: '', unit: '', item: '' })
const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

type Mode = 'read' | 'log' | 'edit'

export function MealSheet({
  meal,
  places,
  v4,
  userId,
  names,
  groupId,
  supabase,
  demo,
  onClose,
  onUpdate,
  onCook,
  onDelete,
  onRemoveCook,
}: {
  meal: HomeMeal
  places: Place[]
  v4: boolean
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
  /** take away one "we made it" entry logged by mistake */
  onRemoveCook: (cookId: string) => void
}) {
  const hasRecipe = !!(meal.ingredients?.length || meal.recipe || meal.recipe_url)
  const [mode, setMode] = useState<Mode>(hasRecipe ? 'read' : 'log')
  const mine = meal.home_meal_ratings.find((r) => r.user_id === userId)
  const [note, setNote] = useState(mine?.notes ?? '')
  const avg = mealAverage(meal)
  const link = safeUrl(meal.recipe_url)
  const photo = photoUrl(meal.photo_path)
  // #123 the restaurant dish this was made from, to compare
  const source = meal.from_dish
    ? places
        .flatMap((p) => (p.dishes ?? []).map((d) => ({ d, p })))
        .find(({ d }) => d.id === meal.from_dish)
    : null
  const sourcePoints = source ? dishAverage(source.d) : null

  // ---- edit mode: a draft you save in one go ----
  const startDraft = () => ({
    name: meal.name,
    kind: meal.kind ?? '',
    cuisine: meal.cuisine ?? '',
    ingredients: meal.ingredients ?? [],
    next: blank(),
    steps: meal.recipe ?? '',
    recipe_url: meal.recipe_url ?? '',
    notes: meal.notes ?? '',
  })
  const [draft, setDraft] = useState(startDraft)
  const set = (changes: Partial<ReturnType<typeof startDraft>>) =>
    setDraft((d) => ({ ...d, ...changes }))
  const dirty =
    draft.name.trim() !== meal.name ||
    (draft.kind || null) !== (meal.kind ?? null) ||
    (draft.cuisine.trim() || null) !== (meal.cuisine ?? null) ||
    JSON.stringify(draft.ingredients) !== JSON.stringify(meal.ingredients ?? []) ||
    (draft.steps.trim() || null) !== (meal.recipe ?? null) ||
    (draft.recipe_url.trim() || null) !== (meal.recipe_url ?? null) ||
    (draft.notes.trim() || null) !== (meal.notes ?? null) ||
    ingredientReady(draft.next)

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

  async function saveEdits() {
    const url = draft.recipe_url.trim()
    if (url && !safeUrl(url)) return toast.error('That doesn’t look like a web link')
    if (!draft.name.trim()) return toast.error('Give it a name')
    const ingredients = [
      ...draft.ingredients,
      ...(ingredientReady(draft.next) ? [draft.next] : []),
    ].map((i) => ({ qty: i.qty.trim(), unit: i.unit, item: i.item.trim() }))
    const ok = await save({
      name: draft.name.trim().slice(0, 120),
      kind: draft.kind || null,
      cuisine: draft.cuisine.trim().slice(0, 40) || null,
      ingredients,
      recipe: draft.steps.trim() || null,
      recipe_url: url || null,
      notes: draft.notes.trim() || null,
    })
    if (!ok) return
    haptic('success')
    toast.success('Recipe saved')
    setDraft({ ...startDraft(), ingredients, next: blank() })
    setMode('read')
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

  const modes: [Mode, string, React.ReactNode][] = [
    ['read', 'Read', <BookOpen key="r" size={16} />],
    ['log', 'Log', <ChefHat key="l" size={16} />],
    ['edit', 'Edit', <Pencil key="e" size={16} />],
  ]
  const steps = stepsOf(meal.recipe)

  return (
    <Sheet label={meal.name} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">
            🏠 Home cooking
            {[meal.kind, meal.cuisine].filter(Boolean).length
              ? ` · ${[meal.kind, meal.cuisine].filter(Boolean).join(' · ')}`
              : ''}
          </p>
          <h2 className="font-serif text-3xl font-bold">{meal.name}</h2>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="segmented segmented-3 mt-4" role="tablist" aria-label="Recipe mode">
        <span
          className="segmented-thumb"
          aria-hidden="true"
          style={{ transform: `translateX(${modes.findIndex(([m]) => m === mode) * 100}%)` }}
        />
        {modes.map(([m, label, icon]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? 'segmented-active' : ''}
            onClick={() => {
              if (m === mode) return
              haptic('tap')
              if (m === 'edit') setDraft(startDraft())
              setMode(m)
            }}
          >
            <span className="inline-flex items-center gap-1">
              {icon} {label}
            </span>
          </button>
        ))}
      </div>

      {mode === 'read' && (
        <div key="read" className="rise-panel mt-5 flex flex-col gap-5">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={meal.name}
              className="w-full rounded-2xl object-cover"
              style={{ aspectRatio: 2 }}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {avg ? `${avg.toFixed(1)}★ from ${meal.home_meal_ratings.length}` : 'Not rated yet'} ·{' '}
              {meal.home_meal_cooks.length
                ? `made ${meal.home_meal_cooks.length}×`
                : 'not made yet'}
              {meal.dietary.length ? ` · ${meal.dietary.join(', ')}` : ''}
              {meal.spice ? ` · ${'🌶️'.repeat(meal.spice)}` : ''}
            </p>
          </div>
          {(meal.ingredients?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-serif text-xl font-bold">Ingredients</h3>
              <ul className="recipe-ingredients">
                {meal.ingredients!.map((i, n) => (
                  <li key={n}>{ingredientText(i)}</li>
                ))}
              </ul>
            </div>
          )}
          {steps.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-serif text-xl font-bold">Steps</h3>
              <ol className="recipe-steps">
                {steps.map((s, n) => (
                  <li key={n}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          {meal.notes && (
            <div className="next-time-note text-sm">
              <strong>Our notes:</strong> {meal.notes}
            </div>
          )}
          {link && (
            <a
              className="text-sm font-semibold text-primary underline"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the recipe on {link.hostname.replace(/^www\./, '')}
            </a>
          )}
          {!hasRecipe && !meal.notes && (
            <div className="surface-soft flex flex-col items-start gap-2 text-sm">
              No recipe written down yet.
              <button className="secondary !min-h-10 text-sm" onClick={() => setMode('edit')}>
                <Pencil size={14} /> Add the recipe
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'log' && (
        <div key="log" className="rise-panel mt-5 flex flex-col gap-5">
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
          <textarea
            className="field min-h-16"
            aria-label="Your note"
            placeholder="How did it turn out? (your comment)"
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => {
              if (note.trim() === (mine?.notes ?? '')) return
              if (!mine) return toast('Tap the stars first, then your note saves with it')
              rate(mine.score, note)
            }}
          />
          {source && (
            <div className="surface-soft flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">vs {source.p.name}</span>
                <span className="block text-muted-foreground">
                  Their {source.d.name}:{' '}
                  {sourcePoints !== null ? `${sourcePoints}/100` : 'not rated'}
                  {avg ? ` · yours ${Math.round(avg * 20)}/100` : ' · rate yours to compare'}
                </span>
              </span>
              {avg && sourcePoints !== null ? (
                <span className="shrink-0 font-semibold">
                  {Math.round(avg * 20) >= sourcePoints ? '🏆 Home wins' : '🍽️ They win'}
                </span>
              ) : null}
            </div>
          )}
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
          </div>
          {meal.home_meal_cooks.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="font-serif text-xl font-bold">Times we made it</h3>
              {[...meal.home_meal_cooks]
                .sort((a, b) => b.cooked_on.localeCompare(a.cooked_on))
                .map((cook) => (
                  <div key={cook.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {day(cook.cooked_on)}
                      {cook.cooked_by
                        ? ` · by ${cook.cooked_by === userId ? 'you' : (names[cook.cooked_by] ?? 'someone')}`
                        : ''}
                    </span>
                    <button
                      className="icon-btn !size-8"
                      aria-label={`Remove the entry from ${day(cook.cooked_on)}`}
                      onClick={() => onRemoveCook(cook.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {mode === 'edit' && (
        <div key="edit" className="rise-panel mt-5 flex flex-col gap-5">
          <input
            className="field"
            aria-label="Name"
            maxLength={120}
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">What kind of dish</span>
            <div className="chip-row">
              {MEAL_KINDS.map((k) => (
                <button
                  key={k}
                  aria-pressed={draft.kind === k}
                  className={`chip chip-sm ${draft.kind === k ? 'chip-active' : ''}`}
                  onClick={() => set({ kind: draft.kind === k ? '' : k })}
                >
                  {k}
                </button>
              ))}
            </div>
            <input
              className="field"
              aria-label="Cuisine"
              list="meal-cuisines"
              placeholder="Cuisine (e.g. Italian)"
              maxLength={40}
              value={draft.cuisine}
              onChange={(event) => set({ cuisine: event.target.value })}
            />
            <datalist id="meal-cuisines">
              {CUISINES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-serif text-xl font-bold">Ingredients</h3>
            {draft.ingredients.map((ing, n) => (
              <IngredientRow
                key={n}
                value={ing}
                onChange={(next) =>
                  set({ ingredients: draft.ingredients.map((x, j) => (j === n ? next : x)) })
                }
                action={
                  <button
                    className="icon-btn !size-9 shrink-0"
                    aria-label={`Remove ${ing.item || 'ingredient'}`}
                    onClick={() =>
                      set({ ingredients: draft.ingredients.filter((_, j) => j !== n) })
                    }
                  >
                    <X size={14} />
                  </button>
                }
              />
            ))}
            <IngredientRow
              value={draft.next}
              onChange={(next) => set({ next })}
              onEnter={() =>
                ingredientReady(draft.next) &&
                set({ ingredients: [...draft.ingredients, draft.next], next: blank() })
              }
              action={
                <button
                  className="primary !size-9 shrink-0 !min-h-9 !p-0"
                  aria-label="Add this ingredient"
                  disabled={!ingredientReady(draft.next)}
                  onClick={() => {
                    haptic('tap')
                    set({ ingredients: [...draft.ingredients, draft.next], next: blank() })
                  }}
                >
                  <Plus size={16} />
                </button>
              }
            />
            <p className="text-xs text-muted-foreground">
              Amount, measure (optional — “2 eggs” needs none) and what it is, then +.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-serif text-xl font-bold">Steps</h3>
            <textarea
              className="field min-h-32"
              aria-label="Steps"
              placeholder={'One step per line:\nBoil the water\nAdd the pasta…'}
              maxLength={6000}
              value={draft.steps}
              onChange={(event) => set({ steps: event.target.value })}
            />
          </div>
          <textarea
            className="field min-h-20"
            aria-label="Notes"
            placeholder="Tweaks, swaps, what to do differently next time…"
            maxLength={2000}
            value={draft.notes}
            onChange={(event) => set({ notes: event.target.value })}
          />
          <input
            className="field"
            aria-label="Recipe link"
            inputMode="url"
            placeholder="Recipe link (optional)"
            value={draft.recipe_url}
            onChange={(event) => set({ recipe_url: event.target.value })}
          />
          <div className="flex gap-2">
            <button
              className="secondary flex-1"
              onClick={() => {
                setDraft(startDraft())
                setMode(hasRecipe ? 'read' : 'log')
              }}
            >
              Cancel
            </button>
            <button className="primary flex-1" disabled={!dirty} onClick={saveEdits}>
              Save recipe
            </button>
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
            <span className="text-sm font-semibold">Photo</span>
            <PhotoButton
              label={meal.name}
              path={meal.photo_path}
              groupId={groupId}
              supabase={supabase}
              demo={demo}
              onChange={(path) => save({ photo_path: path })}
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
                      dietary: on
                        ? meal.dietary.filter((d) => d !== item)
                        : [...meal.dietary, item],
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
          {v4 && (
            <div className="settings-row">
              <span>
                <span className="font-semibold">Share this recipe on Crumbs</span>
                <span className="block text-sm text-muted-foreground">
                  Everyone can see the name, photo, recipe and notes (with your first name), save
                  it, rate it and leave tips. Your group’s ratings stay private.
                </span>
              </span>
              <Switch
                label="Share this recipe on Crumbs"
                checked={!!meal.recipe_public}
                onChange={(on) => {
                  if (on && !hasRecipe) return toast('Add the recipe or a link first')
                  save({ recipe_public: on })
                }}
              />
            </div>
          )}
          <button className="secondary text-destructive" onClick={onDelete}>
            Delete meal
          </button>
        </div>
      )}
    </Sheet>
  )
}

function IngredientRow({
  value,
  onChange,
  onEnter,
  action,
}: {
  value: Ingredient
  onChange: (next: Ingredient) => void
  onEnter?: () => void
  action: React.ReactNode
}) {
  const enter = (event: React.KeyboardEvent) => event.key === 'Enter' && onEnter?.()
  return (
    <div className="ingredient-row">
      <input
        className="field"
        aria-label="Amount"
        placeholder="2"
        inputMode="decimal"
        maxLength={8}
        value={value.qty}
        onChange={(event) => onChange({ ...value, qty: event.target.value })}
        onKeyDown={enter}
      />
      <select
        className="field"
        aria-label="Measure"
        value={value.unit}
        onChange={(event) => onChange({ ...value, unit: event.target.value })}
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u || '—'}
          </option>
        ))}
      </select>
      <input
        className="field"
        aria-label="Ingredient"
        placeholder="flour"
        maxLength={80}
        value={value.item}
        onChange={(event) => onChange({ ...value, item: event.target.value })}
        onKeyDown={enter}
      />
      {action}
    </div>
  )
}
