'use client'
// #123 Recipes people chose to share with everyone on Crumbs (Home cooking → a meal → "Share this
// recipe"). Anyone can rate one and leave a tip to make it better; only first names are shown.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { photoUrl } from '@/lib/photos'
import { haptic } from '@/lib/motion'
import { RatingStars } from './rating-stars'
import { Bookmark } from 'lucide-react'
import type { Ingredient } from '@/hooks/use-crumbs-data'
import { ingredientText, stepsOf } from '@/lib/meals'

type Tip = { tip: string | null; score: number; by: string; mine: boolean }
type Recipe = {
  id: string
  name: string
  notes: string | null
  recipe: string | null
  recipe_url: string | null
  photo_path: string | null
  dietary: string[]
  spice: number | null
  by: string
  mine: boolean
  score: number | null
  reviews: number
  tips: Tip[]
  kind?: string | null
  cuisine?: string | null
  ingredients?: Ingredient[] | null
  saved?: boolean
}

const recipe = (r: Partial<Recipe> & Pick<Recipe, 'id' | 'name' | 'by'>): Recipe => ({
  notes: null,
  recipe: null,
  recipe_url: null,
  photo_path: null,
  dietary: [],
  spice: null,
  mine: false,
  score: null,
  reviews: 0,
  tips: [],
  ...r,
})
const DEMO_TRENDING: Recipe[] = [
  recipe({
    id: 'demo-recipe-1',
    name: 'Weeknight tonkotsu-ish ramen',
    notes: 'Cheat broth: pork stock + a spoon of tahini + garlic oil.',
    recipe:
      '1. Simmer 1 L pork stock with garlic and ginger 20 min.\n2. Whisk in 1 tbsp tahini and soy to taste.\n3. Soft-boil eggs 6½ min, marinate in soy + mirin.\n4. Noodles, broth, egg, scallions, chili oil.',
    spice: 1,
    by: 'Priya',
    score: 4.5,
    reviews: 6,
    tips: [
      { tip: 'A splash of rice vinegar at the end makes it pop', score: 5, by: 'Sam', mine: false },
    ],
  }),
  recipe({ id: 'demo-recipe-2', name: 'Crispy smash tacos', by: 'Leo', score: 4.7, reviews: 9 }),
]
const DEMO_SUGGESTED: Recipe[] = [
  recipe({
    id: 'demo-recipe-3',
    name: 'Sheet-pan chickpea curry',
    by: 'Ana',
    dietary: ['Vegan'],
    score: 4.4,
    reviews: 4,
  }),
]

export type RecipeMode = 'search' | 'trending' | 'suggested' | 'saved'
// Saved in demo mode (no database): kept for this visit only.
const demoSaved = new Set<string>()

/** Shared recipes for one mode (debounced while typing). */
function useRecipes(supabase: any, demo: boolean, mode: RecipeMode, query: string, lim: number) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const q = query.trim()
  useEffect(() => {
    let cancelled = false
    if (demo) {
      const pool =
        mode === 'saved'
          ? [...DEMO_TRENDING, ...DEMO_SUGGESTED]
              .filter((r) => demoSaved.has(r.id))
              .map((r) => ({ ...r, saved: true }))
          : mode === 'suggested'
            ? DEMO_SUGGESTED
            : mode === 'trending'
              ? DEMO_TRENDING
              : [...DEMO_TRENDING, ...DEMO_SUGGESTED].filter((r) =>
                  r.name.toLowerCase().includes(q.toLowerCase()),
                )
      Promise.resolve().then(() => !cancelled && setRecipes(pool))
      return () => {
        cancelled = true
      }
    }
    if (mode === 'search' && !q) return
    const timer = setTimeout(() => {
      supabase
        .rpc('public_recipes', { q: q || null, lim, mode })
        .then(({ data, error }: any) => !cancelled && setRecipes(error ? [] : (data ?? [])))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [supabase, demo, mode, q, lim])
  return [recipes, setRecipes] as const
}

/** Home cooking's recipe finder: Trending and Suggested until you type, then search results. */
/** Home cooking → Saved: other people's shared recipes you bookmarked. */
export function SavedRecipes({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [saved, setSaved] = useRecipes(supabase, demo, 'saved', '', 100)
  const [openId, setOpenId] = useState<string | null>(null)
  if (saved === null) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!saved.length)
    return (
      <p className="surface-soft text-sm">
        Nothing saved yet. In Everyone’s recipes, tap 🔖 on one you want to keep.
      </p>
    )
  return (
    <div className="flex flex-col gap-2">
      {saved.map((r) => (
        <RecipeCard
          key={r.id}
          recipe={r}
          open={openId === r.id}
          onToggle={() => setOpenId(openId === r.id ? null : r.id)}
          supabase={supabase}
          demo={demo}
          onChange={(next) =>
            setSaved((all) =>
              (all ?? [])
                .map((x) => (x.id === next.id ? next : x))
                .filter((x) => x.saved !== false),
            )
          }
        />
      ))}
    </div>
  )
}

export function RecipeFinder({
  supabase,
  demo,
  query,
}: {
  supabase: any
  demo: boolean
  query: string
}) {
  const searching = !!query.trim()
  const [trending, setTrending] = useRecipes(supabase, demo, 'trending', '', 3)
  const [suggested, setSuggested] = useRecipes(supabase, demo, 'suggested', '', 3)
  const [found, setFound] = useRecipes(supabase, demo, 'search', query, 20)
  const [openId, setOpenId] = useState<string | null>(null)

  const section = (
    title: string,
    tag: string | null,
    list: Recipe[] | null,
    set: (update: (all: Recipe[] | null) => Recipe[] | null) => void,
    empty: string | null,
  ) =>
    list === null ? null : list.length ? (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        {list.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            tag={tag}
            open={openId === r.id}
            onToggle={() => setOpenId(openId === r.id ? null : r.id)}
            supabase={supabase}
            demo={demo}
            onChange={(next) => set((all) => (all ?? []).map((x) => (x.id === next.id ? next : x)))}
          />
        ))}
      </div>
    ) : empty ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : null

  if (searching)
    return section(
      'Recipes on Crumbs',
      null,
      found,
      setFound,
      'No shared recipes match. Try another word.',
    )
  const nothing = trending?.length === 0 && suggested?.length === 0
  return (
    <>
      {section('Trending on Crumbs', '🔥 Trending', trending, setTrending, null)}
      {section('Suggested for you', '✨ Suggested', suggested, setSuggested, null)}
      {nothing && (
        <p className="text-sm text-muted-foreground">
          Recipes people share show up here. Share one of yours: open a meal → “Share this recipe on
          Crumbs”.
        </p>
      )}
    </>
  )
}

function RecipeCard({
  recipe,
  tag = null,
  open,
  onToggle,
  supabase,
  demo,
  onChange,
}: {
  recipe: Recipe
  /** "🔥 Trending" / "✨ Suggested" */
  tag?: string | null
  open: boolean
  onToggle: () => void
  supabase: any
  demo: boolean
  onChange: (recipe: Recipe) => void
}) {
  const mine = recipe.tips.find((t) => t.mine)
  const [score, setScore] = useState(mine?.score ?? 0)
  const [tip, setTip] = useState(mine?.tip ?? '')
  const photo = photoUrl(recipe.photo_path)
  const steps = stepsOf(recipe.recipe)

  async function toggleSave() {
    const next = !recipe.saved
    if (demo) {
      if (next) demoSaved.add(recipe.id)
      else demoSaved.delete(recipe.id)
    } else {
      const { error } = next
        ? await supabase.from('recipe_saves').insert({ meal_id: recipe.id })
        : await supabase.from('recipe_saves').delete().eq('meal_id', recipe.id)
      if (error && error.code !== '23505') return toast.error(error.message)
    }
    haptic(next ? 'success' : 'tap')
    toast(next ? 'Saved — find it in Home cooking → Saved' : 'Removed from Saved')
    onChange({ ...recipe, saved: next })
  }

  async function review(nextScore = score, nextTip = tip) {
    if (!nextScore) return toast('Tap the stars first')
    const clean = nextTip.trim().slice(0, 300) || null
    if (!demo) {
      const { error } = await supabase
        .from('recipe_reviews')
        .upsert({ meal_id: recipe.id, score: nextScore, tip: clean })
      if (error) return toast.error(error.message)
    }
    haptic('success')
    const others = recipe.tips.filter((t) => !t.mine)
    const had = !!mine
    onChange({
      ...recipe,
      reviews: recipe.reviews + (had ? 0 : 1),
      tips: [{ tip: clean, score: nextScore, by: 'You', mine: true }, ...others],
    })
    toast.success('Thanks — saved')
  }

  return (
    <div className="surface-soft flex flex-col gap-2">
      <button className="flex items-center gap-3 text-left" onClick={onToggle}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        )}
        <span className="min-w-0 flex-1">
          {tag && <span className="tag mb-1 inline-block !text-[0.7rem]">{tag}</span>}
          <span className="block font-semibold">{recipe.name}</span>
          <span className="block text-xs text-muted-foreground">
            {[recipe.kind, recipe.cuisine].filter(Boolean).length
              ? `${[recipe.kind, recipe.cuisine].filter(Boolean).join(' · ')} · `
              : ''}
            by {recipe.mine ? 'you' : recipe.by}
            {recipe.dietary.length ? ` · ${recipe.dietary.join(', ')}` : ''}
            {recipe.spice ? ` · ${'🌶️'.repeat(recipe.spice)}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-serif text-xl text-primary">
            {recipe.score ? recipe.score.toFixed(1) : '—'}
          </span>
          <span className="block text-xs text-muted-foreground">
            {recipe.reviews} rating{recipe.reviews === 1 ? '' : 's'}
          </span>
        </span>
      </button>
      {!recipe.mine && (
        <button
          className={`chip chip-sm self-start ${recipe.saved ? 'chip-active' : ''}`}
          aria-pressed={!!recipe.saved}
          onClick={toggleSave}
        >
          <Bookmark size={14} /> {recipe.saved ? 'Saved' : 'Save'}
        </button>
      )}
      {open && (
        <div className="rise-panel flex flex-col gap-2">
          {(recipe.ingredients?.length ?? 0) > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground">Ingredients</p>
              <ul className="recipe-ingredients text-sm">
                {recipe.ingredients!.map((i, n) => (
                  <li key={n}>{ingredientText(i)}</li>
                ))}
              </ul>
            </>
          )}
          {steps.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground">Steps</p>
              <ol className="recipe-steps text-sm">
                {steps.map((step, n) => (
                  <li key={n}>{step}</li>
                ))}
              </ol>
            </>
          )}
          {recipe.notes && <p className="text-sm text-muted-foreground">{recipe.notes}</p>}
          {recipe.recipe_url && /^https?:\/\//.test(recipe.recipe_url) && (
            <a
              className="text-sm font-semibold text-primary underline"
              href={recipe.recipe_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open the recipe link
            </a>
          )}
          {recipe.tips.filter((t) => t.tip && !t.mine).length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground">Tips</p>
              {recipe.tips
                .filter((t) => t.tip && !t.mine)
                .map((t, i) => (
                  <p key={i} className="text-sm">
                    💡 {t.tip} <span className="text-xs text-muted-foreground">— {t.by}</span>
                  </p>
                ))}
            </div>
          )}
          {!recipe.mine && (
            <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-2">
              <RatingStars
                value={score}
                label="Your rating"
                onChange={(n) => {
                  setScore(n)
                  review(n, tip)
                }}
              />
              <textarea
                className="field min-h-14 text-base"
                maxLength={300}
                placeholder="A tip to make it better (optional)"
                value={tip}
                onChange={(event) => setTip(event.target.value)}
                onBlur={() => score && tip.trim() !== (mine?.tip ?? '') && review(score, tip)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
