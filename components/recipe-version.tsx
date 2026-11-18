'use client'
// Round 90: "Make my own version" of a recipe (a credited copy in My Crumbs) and the credit line
// "Based on Ana's Sunday lasagna", with the original shown when it's on Crumbs.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { HomeMeal } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { ingredientText, stepsOf } from '@/lib/meals'
import { creditLine, demoVersion, type RecipeCredit } from '@/lib/recipe-versions'

/** Copies a recipe you can see into your My Crumbs. Returns the new recipe, or null. */
export async function makeMyVersion(
  supabase: any,
  demo: boolean,
  source: { id: string; name: string; created_by?: string | null; [key: string]: unknown },
  demoTarget?: { personalGroupId: string | null; userId: string | null },
): Promise<HomeMeal | null> {
  if (demo) {
    if (!demoTarget?.personalGroupId || !demoTarget.userId) {
      toast('Making your own version needs the real database')
      return null
    }
    haptic('success')
    return demoVersion(
      { ...(source as unknown as HomeMeal), created_by: source.created_by ?? null },
      demoTarget.personalGroupId,
      demoTarget.userId,
    ) as unknown as HomeMeal
  }
  const { data, error } = await supabase.rpc('make_my_version', { meal: source.id })
  if (error) {
    toast.error(
      /make_my_version|schema cache|PGRST202/i.test(error.message ?? '')
        ? 'Making your own version isn’t switched on yet'
        : error.message,
    )
    return null
  }
  haptic('success')
  return { ...(data as HomeMeal), home_meal_ratings: [], home_meal_cooks: [] }
}

/** Whose recipe this one is based on (null for an original). */
export function useRecipeCredit(
  supabase: any,
  demo: boolean,
  meal: Pick<HomeMeal, 'id' | 'based_on_name' | 'based_on_by'>,
  userId: string | undefined,
  names: Record<string, string>,
) {
  const [fetched, setFetched] = useState<{ id: string; credit: RecipeCredit | null } | null>(null)
  const needs = !!meal.based_on_name && !demo
  useEffect(() => {
    if (!needs) return
    let live = true
    Promise.resolve(supabase.rpc('recipe_credit', { meal: meal.id }))
      .then(({ data, error }: any) => live && setFetched({ id: meal.id, credit: error ? null : data }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [needs, supabase, meal.id])
  if (!meal.based_on_name) return null
  if (fetched?.id === meal.id && fetched.credit) return fetched.credit
  // until it loads (and in demo mode): what this phone already knows
  const by =
    meal.based_on_by && meal.based_on_by === userId
      ? 'you'
      : ((meal.based_on_by && names[meal.based_on_by]?.split(' ')[0]) ?? 'someone')
  return { name: meal.based_on_name, by, original: null } satisfies RecipeCredit
}

export function CreditLine({ credit }: { credit: RecipeCredit | null }) {
  const [open, setOpen] = useState(false)
  if (!credit) return null
  const original = credit.original
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">
        ↪ {creditLine(credit.name, credit.by)}
        {original && (
          <>
            {' · '}
            <button className="font-semibold text-primary underline" onClick={() => setOpen(!open)}>
              {open ? 'Hide the original' : 'See the original'}
            </button>
          </>
        )}
      </p>
      {open && original && (
        <div className="surface-soft rise-panel flex flex-col gap-2 text-sm">
          <p className="font-semibold">{original.name}</p>
          {!!original.ingredients?.length && (
            <ul className="recipe-ingredients">
              {original.ingredients.map((i, n) => (
                <li key={n}>{ingredientText(i)}</li>
              ))}
            </ul>
          )}
          {stepsOf(original.recipe).length > 0 && (
            <ol className="recipe-steps">
              {stepsOf(original.recipe).map((s, n) => (
                <li key={n}>{s}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
