'use client'
// #123 Recipes people chose to share with everyone on Crumbs (Home cooking → a meal → "Share this
// recipe"). Anyone can rate one and leave a tip to make it better; only first names are shown.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { photoUrl } from '@/lib/photos'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'
import { RatingStars } from './rating-stars'

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
}

const DEMO: Recipe[] = [
  {
    id: 'demo-recipe-1',
    name: 'Weeknight tonkotsu-ish ramen',
    notes: 'Cheat broth: pork stock + a spoon of tahini + garlic oil.',
    recipe:
      '1. Simmer 1 L pork stock with garlic and ginger 20 min.\n2. Whisk in 1 tbsp tahini and soy to taste.\n3. Soft-boil eggs 6½ min, marinate in soy + mirin.\n4. Noodles, broth, egg, scallions, chili oil.',
    recipe_url: null,
    photo_path: null,
    dietary: [],
    spice: 1,
    by: 'Priya',
    mine: false,
    score: 4.5,
    reviews: 6,
    tips: [
      { tip: 'A splash of rice vinegar at the end makes it pop', score: 5, by: 'Sam', mine: false },
    ],
  },
]

export function PublicRecipes({
  supabase,
  demo,
  onClose,
}: {
  supabase: any
  demo: boolean
  onClose: () => void
}) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(demo ? DEMO : null)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (demo) return
    let cancelled = false
    const timer = setTimeout(() => {
      supabase
        .rpc('public_recipes', { q: query.trim() || null, lim: 40 })
        .then(({ data, error }: any) => {
          if (cancelled) return
          if (error) toast.error(error.message)
          setRecipes(data ?? [])
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [demo, query, supabase])

  const shown = (recipes ?? []).filter(
    (r) => !demo || r.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <Overlay label="Recipes from Crumbs" title="Recipes from Crumbs" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Home recipes people shared with everyone. Rate one and leave a tip to make it better.
        </p>
        <label className="field flex items-center gap-2">
          <Search size={16} className="text-muted-foreground" />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="Search recipes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {recipes === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : shown.length ? (
          shown.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              open={openId === recipe.id}
              onToggle={() => setOpenId(openId === recipe.id ? null : recipe.id)}
              supabase={supabase}
              demo={demo}
              onChange={(next) =>
                setRecipes((all) => (all ?? []).map((r) => (r.id === next.id ? next : r)))
              }
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No shared recipes yet. Open one of your home meals and switch on “Share this recipe”.
          </p>
        )}
      </div>
    </Overlay>
  )
}

function RecipeCard({
  recipe,
  open,
  onToggle,
  supabase,
  demo,
  onChange,
}: {
  recipe: Recipe
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
          <span className="block font-semibold">{recipe.name}</span>
          <span className="block text-xs text-muted-foreground">
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
      {open && (
        <div className="rise-panel flex flex-col gap-2">
          {recipe.recipe && <p className="whitespace-pre-line text-sm">{recipe.recipe}</p>}
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
