'use client'
// #77 Home cooking: meals you make yourselves, kept apart from restaurants.
import { track } from '@/lib/analytics'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, ChefHat, ChevronDown, Dices, Plus, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import type { HomeMeal, Place, Profile } from '@/hooks/use-crumbs-data'
import { lastCooked, mealAverage } from '@/lib/meals'
import { MealSheet } from './meal-sheet'
import { RecipeFinder, SavedRecipes } from './public-recipes'
import { Search } from 'lucide-react'
import { haptic } from '@/lib/motion'
import { undoableDelete } from '@/lib/undoable'
import { RatingStars } from './rating-stars'
import { timeAgo } from './social'
import { StatusFilter } from './status-filter'

const today = () => new Date().toISOString().slice(0, 10)
export { mealAverage } from '@/lib/meals'

const HOME_FILTERS = ['All', 'Cooked', 'Want to cook', 'Shared'] as const

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
  places = [],
}: {
  /** #123 to compare a meal with the restaurant dish it came from */
  places?: Place[]
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
  const [filter, setFilter] = useState<'All' | 'Cooked' | 'Want to cook' | 'Shared'>('All')
  // Our kitchen (your group's meals and recipes) vs everyone else's recipes on Crumbs
  const [section, setSection] = useState<'ours' | 'everyone' | 'saved'>('ours')
  // What kind of dish (Dessert, Soup…) — only kinds you've used show as filters.
  const [kind, setKind] = useState<string | null>(null)
  const kinds = [...new Set(meals.map((m) => m.kind).filter((k): k is string => !!k))]
  const [everyoneQuery, setEveryoneQuery] = useState('')
  // How your shared recipes are doing on Crumbs (average and count of everyone's ratings)
  const [crumbsScores, setCrumbsScores] = useState<Record<string, { avg: number; n: number }>>({})
  const sharedIds = meals
    .filter((m) => m.recipe_public)
    .map((m) => m.id)
    .sort()
    .join(',')
  useEffect(() => {
    let cancelled = false
    if (demo || !sharedIds) return
    supabase
      .from('recipe_reviews')
      .select('meal_id,score')
      .in('meal_id', sharedIds.split(','))
      .then(({ data }: any) => {
        if (cancelled || !data) return
        const out: Record<string, { avg: number; n: number }> = {}
        for (const r of data) {
          const hit = (out[r.meal_id] ??= { avg: 0, n: 0 })
          hit.avg = (hit.avg * hit.n + r.score) / (hit.n + 1)
          hit.n += 1
        }
        setCrumbsScores(out)
      })
    return () => {
      cancelled = true
    }
  }, [sharedIds, demo, supabase])
  const [sort, setSort] = useState<'Newest' | 'Top rated' | 'Cooked lately'>('Newest')
  const homeCounts = {
    All: meals.length,
    Cooked: meals.filter((m) => m.status === 'Cooked').length,
    'Want to cook': meals.filter((m) => m.status === 'Want to cook').length,
    Shared: meals.filter((m) => m.recipe_public).length,
  }
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<HomeMeal['status']>('Cooked')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  // #123 search your meals and recipes shared on Crumbs
  const [query, setQuery] = useState('')
  const open = meals.find((meal) => meal.id === openId) ?? null

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = meals.filter(
      (meal) =>
        (filter === 'All' ||
          (filter === 'Shared' ? !!meal.recipe_public : meal.status === filter)) &&
        (!kind || meal.kind === kind) &&
        (!needle ||
          [
            meal.name,
            meal.notes,
            meal.recipe,
            meal.kind,
            meal.cuisine,
            ...(meal.ingredients ?? []).map((i) => i.item),
          ].some((t) => t?.toLowerCase().includes(needle))),
    )
    if (sort === 'Top rated') return [...list].sort((a, b) => mealAverage(b) - mealAverage(a))
    if (sort === 'Cooked lately')
      return [...list].sort((a, b) => (lastCooked(b) ?? '').localeCompare(lastCooked(a) ?? ''))
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [meals, filter, sort, query, kind])

  if (!v4 && !demo)
    return (
      <div className="surface flex flex-col items-center gap-2 text-center">
        <ChefHat size={36} className="text-primary" />
        <h3 className="font-serif text-2xl font-bold">Home cooking</h3>
        <p className="text-sm text-muted-foreground">
          Log the meals you cook together, rate them and remember the recipes. This unlocks with the
          next Crumbs update.
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
      track('home_meal_added', { status })
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
      {(v4 || demo) && (
        <div
          className="segmented segmented-3"
          role="tablist"
          aria-label="Our kitchen, everyone's recipes or saved recipes"
        >
          <span
            className="segmented-thumb"
            aria-hidden="true"
            style={{
              transform: `translateX(${['ours', 'everyone', 'saved'].indexOf(section) * 100}%)`,
            }}
          />
          {(['ours', 'everyone', 'saved'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={section === s}
              className={section === s ? 'segmented-active' : ''}
              onClick={() => {
                if (s === section) return
                haptic('tap')
                setSection(s)
              }}
            >
              {s === 'ours' ? 'Our kitchen' : s === 'everyone' ? 'Everyone’s' : 'Saved'}
            </button>
          ))}
        </div>
      )}
      {section === 'saved' ? (
        <div key="saved" className="tab-pane tab-from-right flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Recipes from other people you saved (tap 🔖 on any shared recipe).
          </p>
          <SavedRecipes supabase={supabase} demo={demo} />
        </div>
      ) : section === 'everyone' ? (
        <div key="everyone" className="tab-pane tab-from-right flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Home recipes other people shared on Crumbs. Rate one and leave a tip to make it better.
          </p>
          <label className="field flex items-center gap-2">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              aria-label="Search recipes on Crumbs"
              placeholder="Search recipes on Crumbs"
              value={everyoneQuery}
              onChange={(event) => setEveryoneQuery(event.target.value)}
            />
          </label>
          <RecipeFinder supabase={supabase} demo={demo} query={everyoneQuery} />
        </div>
      ) : (
        <div key="ours" className="tab-pane tab-from-left flex flex-col gap-4">
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
          <label className="field flex items-center gap-2">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              aria-label="Search our meals"
              placeholder="Search our meals and recipes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
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
          <StatusFilter
            label="Show meals"
            items={HOME_FILTERS}
            value={filter}
            counts={meals.length ? homeCounts : null}
            onChange={(item) => {
              if (item !== filter) haptic('select')
              setFilter(item as typeof filter)
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="pick-pill">
              <ArrowUpDown size={15} aria-hidden="true" />
              <span aria-hidden="true">{sort}</span>
              <select
                aria-label="Sort by"
                value={sort}
                onChange={(event) => {
                  haptic('select')
                  setSort(event.target.value as typeof sort)
                }}
              >
                {(['Newest', 'Top rated', 'Cooked lately'] as const).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
            {kinds.length > 0 && (
              <label className={`pick-pill ${kind ? 'pick-pill-on' : ''}`}>
                <Utensils size={15} aria-hidden="true" />
                <span aria-hidden="true">{kind ?? 'All kinds'}</span>
                <select
                  aria-label="Kind of dish"
                  value={kind ?? ''}
                  onChange={(event) => {
                    haptic('select')
                    setKind(event.target.value || null)
                  }}
                >
                  <option value="">All kinds</option>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </label>
            )}
            {(filter !== 'All' || kind || sort !== 'Newest') && (
              <button
                type="button"
                className="text-sm font-semibold text-primary"
                onClick={() => {
                  haptic('tap')
                  setFilter('All')
                  setKind(null)
                  setSort('Newest')
                }}
              >
                Reset
              </button>
            )}
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
                          {[meal.kind, meal.cuisine].filter(Boolean).length
                            ? `${[meal.kind, meal.cuisine].filter(Boolean).join(' · ')} · `
                            : ''}
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
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={`chip chip-sm ${meal.status === 'Cooked' ? 'chip-active' : ''}`}
                        >
                          {meal.status}
                        </span>
                        {meal.recipe_public && (
                          <span className="text-xs text-muted-foreground">
                            🌍 Shared
                            {crumbsScores[meal.id]
                              ? ` · ${crumbsScores[meal.id].avg.toFixed(1)}★ from ${crumbsScores[meal.id].n} on Crumbs`
                              : demo
                                ? ' · 4.3★ from 3 on Crumbs'
                                : ' · no ratings yet'}
                          </span>
                        )}
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
        </div>
      )}
      {open && (
        <MealSheet
          meal={open}
          places={places}
          v4={v4 || demo}
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
          onRemoveCook={async (cookId) => {
            const before = open.home_meal_cooks
            setMeals((current) =>
              current.map((m) =>
                m.id === open.id
                  ? { ...m, home_meal_cooks: m.home_meal_cooks.filter((c) => c.id !== cookId) }
                  : m,
              ),
            )
            if (demo) return
            const { error } = await supabase.from('home_meal_cooks').delete().eq('id', cookId)
            if (error) {
              toast.error(error.message)
              setMeals((current) =>
                current.map((m) => (m.id === open.id ? { ...m, home_meal_cooks: before } : m)),
              )
            } else toast('Entry removed')
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
