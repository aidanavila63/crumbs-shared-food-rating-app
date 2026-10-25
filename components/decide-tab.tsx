'use client'
import { useShowScore } from './score-input'
import { useMemo, useState } from 'react'
import { Dices, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Place, PlaceVisit, Profile } from '@/hooks/use-crumbs-data'
import { placeAverage } from './place-card'
import { TonightCard } from './tonight-card'
import { CravingButton } from './craving-button'
import { ChallengesCard } from './goals-cards'
import { WeatherNudge } from './weather-nudge'
import { TurnCard } from './turn-card'
import type { Group, HomeMeal, List } from '@/hooks/use-crumbs-data'
import type { DecideStore, Plan, SwipeSession } from '@/hooks/use-decide'
import { settingsOf } from '@/lib/ratings'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'
import { DecideTogether } from './decide-together'
import { PlansCard, PlansPage, type PlanDraft } from './plans'
import { CrawlPlanner } from './crawl-planner'
import { NearbyRecs } from './nearby-recs'
import { beenAWhile, hiddenGems, sinceText } from '@/lib/smart-lists'
import { useGems } from '@/hooks/use-gems'
import { defaultWrappedYear, wrappedYears } from '@/lib/wrapped'
import { mealTimeAt } from '@/lib/visit-rating'

type Idea = { title: string; why: string }

/** Decide & Plan: what to eat next, challenges, and ideas. */
export function DecideTab({
  places,
  allPlaces,
  members = [],
  names = {},
  groupId,
  loading = false,
  onSelect,
  onSurprise,
  onWrapped,
  home = null,
  meals = [],
  userId,
  turns = false,
  weather = true,
  aiIdeas = true,
  decide,
  lists = [],
  onLists = () => {},
  group = null,
  supabase,
  demo = false,
  onShowOnMap = () => {},
  onPlaceAdded = () => {},
  onPlaceUpdated = () => {},
}: {
  onPlaceAdded?: (place: Place) => void
  /** #198 a visit logged from "Did you go?" */
  onPlaceUpdated?: (place: Place) => void
  /** #30/#40/#48 store (null until the v4 database update has run) */
  decide?: DecideStore | null
  lists?: List[]
  onLists?: (lists: List[]) => void
  group?: Group | null
  supabase?: any
  demo?: boolean
  onShowOnMap?: (listId: string) => void
  /** #109 admin switch */
  aiIdeas?: boolean
  meals?: HomeMeal[]
  userId?: string
  /** #37 group setting */
  turns?: boolean
  /** #35 group setting */
  weather?: boolean
  places: Place[]
  /** Unmasked places (blind ratings) for challenges, which only count visits. */
  allPlaces: Place[]
  members?: Profile[]
  names?: Record<string, string>
  groupId: string
  loading?: boolean
  onSelect: (place: Place) => void
  onSurprise: () => void
  /** #61 open Crumbs Wrapped (teaser card in Dec–Feb) */
  onWrapped?: () => void
  home?: { lat: number; lng: number } | null
}) {
  const show = useShowScore()
  const [page, setPage] = useState<'together' | 'plans' | 'crawl' | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const openPlace = (place: Place) => {
    setPage(null)
    onSelect(place)
  }
  async function planFromVote(placeId: string, session: SwipeSession) {
    if (!decide) return
    const linked = decide.plans.find((p) => p.session_id === session.id)
    if (linked) {
      await decide.savePlan({ ...linked, place_id: placeId })
      decide.closeSession(session.id)
      toast.success('Place added to the plan')
    } else setDraft({ title: session.title ?? '', place_id: placeId, session_id: session.id })
    setPage('plans')
  }
  async function voteForPlan(plan: Plan) {
    if (!decide) return
    const existing = plan.session_id && decide.sessions.find((s) => s.id === plan.session_id)
    if (existing) {
      setSessionId(existing.id)
      return setPage('together')
    }
    const pool = places.filter(
      (p) => p.status === 'Want to try' && p.business_status !== 'CLOSED_PERMANENTLY',
    )
    const from = pool.length >= 2 ? pool : places
    if (from.length < 2) return toast('Add a few places first')
    const ids = [...from]
      .sort(() => Math.random() - 0.5)
      .slice(0, 15)
      .map((p) => p.id)
    const session = await decide.startSession(plan.title, ids)
    if (!session) return
    await decide.savePlan({ ...plan, session_id: session.id })
    setSessionId(session.id)
    setPage('together')
  }
  const openVotes = decide?.sessions.filter((s) => s.status === 'open').length ?? 0
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [thinking, setThinking] = useState(false)

  // #61 Wrapped teaser: December to February, when there's a year to show
  const wrapYear = useMemo(() => {
    const month = new Date().getMonth()
    if (![11, 0, 1].includes(month)) return null
    const year = defaultWrappedYear(places)
    return wrappedYears(places).includes(year) ? year : null
  }, [places])
  // #33 favourites you haven't been back to in 3+ months
  const whileAgo = useMemo(() => beenAWhile(places), [places])
  const gemCounts = useGems(places, supabase, demo)
  // The Decide & Plan card works from day one; the smart list waits for 5+ groups on Crumbs.
  const gems = useMemo(() => hiddenGems(places, gemCounts, 1), [places, gemCounts])
  const insights = useMemo(() => {
    const rated = places.filter((place) => place.place_ratings.length)
    const favourites = rated
      .filter((place) => placeAverage(place) >= 4)
      .sort((a, b) => placeAverage(b) - placeAverage(a))
      .slice(0, 3)
    const disagreements = rated.filter((place) => {
      const scores = place.place_ratings.map((rating) => rating.score)
      return scores.length > 1 && Math.max(...scores) - Math.min(...scores) >= 2
    })
    const cuisineScores = new Map<string, number[]>()
    rated.forEach((place) => {
      if (place.cuisine) {
        cuisineScores.set(place.cuisine, [
          ...(cuisineScores.get(place.cuisine) ?? []),
          placeAverage(place),
        ])
      }
    })
    const topCuisines = [...cuisineScores.entries()]
      .map(([cuisine, scores]) => ({
        cuisine,
        average: scores.reduce((a, b) => a + b, 0) / scores.length,
      }))
      .filter((item) => item.average >= 3.5)
      .sort((a, b) => b.average - a.average)
      .slice(0, 3)
    const liked = new Set(topCuisines.map((item) => item.cuisine))
    const wishlist = places.filter((place) => place.status === 'Want to try')
    const picks = [
      ...wishlist.filter((place) => place.cuisine && liked.has(place.cuisine)),
      ...wishlist.filter((place) => !(place.cuisine && liked.has(place.cuisine))),
    ].slice(0, 3)
    return { rated, favourites, disagreements, topCuisines, picks, liked }
  }, [places])

  async function getIdeas() {
    setThinking(true)
    try {
      const taste = insights.rated
        .map(
          (place) =>
            `${place.name} (${place.cuisine ?? 'cuisine unknown'}): ${place.place_ratings
              .map((rating) => `${names[rating.user_id] ?? 'Someone'} ${rating.score}/5`)
              .join(', ')}`,
        )
        .join('\n')
        .slice(0, 3900)
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taste }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setIdeas(result.ideas)
    } catch (error: any) {
      toast.error(error?.message || 'Could not get ideas')
    } finally {
      setThinking(false)
    }
  }

  return (
    <section className="stagger flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted-foreground">What are we eating?</p>
        <h2 className="font-serif text-3xl font-bold">Decide &amp; Plan</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="primary flex-1" onClick={onSurprise}>
          <Dices size={20} /> Surprise us
        </button>
        <CravingButton groupId={groupId} />
      </div>

      {!loading && weather && <WeatherNudge places={places} home={home} onSelect={onSelect} />}

      {!loading && <TonightCard places={places} members={members} onOpen={onSelect} home={home} />}
      {decide?.enabled && (
        <div className="grid grid-cols-2 gap-3">
          <button
            className="category-card category-together col-span-2"
            onClick={() => {
              haptic('select')
              setSessionId(null)
              setPage('together')
            }}
          >
            <span className="category-emoji" aria-hidden="true">
              💘
            </span>
            <span className="min-w-0">
              <span className="block font-serif text-2xl font-bold">Decide together</span>
              <span className="block text-sm opacity-85">
                Swipe to match, vote on a list, pick by occasion
              </span>
            </span>
            {openVotes > 0 && <span className="category-badge">{openVotes}</span>}
          </button>
          <button
            className="category-card"
            onClick={() => {
              haptic('select')
              setPage('crawl')
            }}
          >
            <span className="category-emoji" aria-hidden="true">
              🚶
            </span>
            <span className="block font-bold">Food crawl</span>
          </button>
          <button
            className="category-card"
            onClick={() => {
              haptic('select')
              setPage('plans')
            }}
          >
            <span className="category-emoji" aria-hidden="true">
              📅
            </span>
            <span className="block font-bold">Plans</span>
          </button>
        </div>
      )}
      {decide?.enabled && (
        <PlansCard
          store={decide}
          places={allPlaces}
          userId={userId}
          onOpen={() => setPage('plans')}
          onWent={async (plan, place) => {
            // #198 log the visit on the plan's day, then open the place to rate it
            const at = new Date(plan.starts_at!)
            const pad = (n: number) => String(n).padStart(2, '0')
            const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
            let visit: PlaceVisit = {
              id: crypto.randomUUID(),
              place_id: place.id,
              visited_on: day,
              spend: null,
              created_by: userId,
              kind: 'dine_in',
              people: plan.party ?? null,
              meal_time: mealTimeAt(at),
            }
            if (!demo) {
              const { id, ...row } = visit
              void id
              const { data, error } = await supabase
                .from('place_visits')
                .insert(row)
                .select('*')
                .single()
              if (error) return toast.error(error.message)
              visit = data
              if (place.status !== 'Been')
                await supabase.from('places').update({ status: 'Been' }).eq('id', place.id)
            }
            const updated: Place = {
              ...place,
              status: 'Been',
              visited_on: day > (place.visited_on ?? '') ? day : place.visited_on,
              place_visits: [...(place.place_visits ?? []), visit],
            }
            onPlaceUpdated(updated)
            toast.success(`Logged ${place.name} — how was it?`)
            onSelect?.(updated)
          }}
        />
      )}
      {!loading && turns && (
        <TurnCard
          places={allPlaces}
          meals={meals}
          members={members}
          userId={userId}
          names={names}
        />
      )}

      {!places.length && (
        <div className="empty">
          <Sparkles className="mx-auto text-primary" />
          <h2 className="mt-3 font-serif text-2xl font-bold">Your ideas are waiting</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add and rate a few places and Crumbs will learn what you both like.
          </p>
        </div>
      )}

      {wrapYear && onWrapped && (
        <button className="surface wrap-teaser text-left" onClick={onWrapped}>
          <span className="text-3xl" aria-hidden="true">
            🎁
          </span>
          <span>
            <span className="block font-serif text-2xl font-bold">Your {wrapYear} Wrapped</span>
            <span className="block text-sm opacity-90">Your year in food, ready to share</span>
          </span>
        </button>
      )}

      {whileAgo.length > 0 && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">🕰️ Been a while</span>
          {whileAgo.slice(0, 3).map(({ place, last }) => (
            <button
              key={place.id}
              className="surface-soft flex items-center justify-between gap-2 text-left"
              onClick={() => onSelect?.(place)}
            >
              <span className="min-w-0">
                <span className="block font-semibold">{place.name}</span>
                <span className="block text-sm text-muted-foreground">
                  Last time {sinceText(last!)} — you loved it
                </span>
              </span>
              <span className="font-serif text-xl text-primary">{show(placeAverage(place))}</span>
            </button>
          ))}
        </div>
      )}

      {gems.length > 0 && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">💎 Hidden gem{gems.length > 1 ? 's' : ''}</span>
          {gems.slice(0, 2).map((place) => {
            const saved = gemCounts?.saved[place.restaurant_id!] ?? 1
            return (
              <button
                key={place.id}
                className="surface-soft flex items-center justify-between gap-2 text-left"
                onClick={() => onSelect?.(place)}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{place.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {saved <= 1
                      ? 'Only your group has found it on Crumbs'
                      : 'Only one other group has found it on Crumbs'}
                  </span>
                </span>
                <span className="font-serif text-xl text-primary">{show(placeAverage(place))}</span>
              </button>
            )
          })}
        </div>
      )}

      {insights.picks.length > 0 && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">Next up from your list</span>
          {insights.picks.map((place) => (
            <button
              key={place.id}
              className="surface-soft text-left"
              onClick={() => onSelect?.(place)}
            >
              <p className="font-semibold">{place.name}</p>
              <p className="text-sm text-muted-foreground">
                {place.cuisine && insights.liked.has(place.cuisine)
                  ? `You both rate ${place.cuisine} highly`
                  : place.formatted_address || 'On your want-to-try list'}
              </p>
            </button>
          ))}
        </div>
      )}

      {!loading && (
        <NearbyRecs
          places={places}
          groupId={groupId}
          userId={userId}
          supabase={supabase}
          demo={demo}
          onSelect={onSelect}
          onAdded={onPlaceAdded}
        />
      )}

      {insights.favourites.length > 0 && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">Group favourites</span>
          {insights.favourites.map((place) => (
            <button
              key={place.id}
              className="surface-soft flex items-center justify-between text-left"
              onClick={() => onSelect?.(place)}
            >
              <span className="font-semibold">{place.name}</span>
              <span className="font-serif text-xl text-primary">{show(placeAverage(place))}</span>
            </button>
          ))}
        </div>
      )}

      {insights.topCuisines.length > 0 && (
        <div className="surface">
          <span className="tag">Your tastes</span>
          <p className="mt-3 text-sm">
            You lean towards{' '}
            <strong>{insights.topCuisines.map((item) => item.cuisine).join(', ')}</strong>.
          </p>
        </div>
      )}

      {insights.disagreements.length > 0 && (
        <div className="surface">
          <span className="tag">Hot takes</span>
          <p className="mt-3 text-sm">
            You disagree on{' '}
            <strong>{insights.disagreements.map((place) => place.name).join(', ')}</strong>.
          </p>
        </div>
      )}

      <ChallengesCard places={allPlaces} />

      {aiIdeas && (
        <div className="surface flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="tag">AI ideas</span>
              <p className="mt-2 text-sm text-muted-foreground">
                Cuisines and dishes to try next. These are ideas, not verified restaurants.
              </p>
            </div>
            <button
              className="primary shrink-0"
              disabled={thinking || !insights.rated.length}
              onClick={getIdeas}
            >
              {thinking ? 'Thinking…' : ideas.length ? 'Refresh' : 'Get ideas'}
            </button>
          </div>
          {!insights.rated.length && (
            <p className="text-sm text-muted-foreground">Rate a place first to unlock ideas.</p>
          )}
          {ideas.map((idea) => (
            <div className="surface-soft" key={idea.title}>
              <p className="font-semibold">{idea.title}</p>
              <p className="text-sm text-muted-foreground">{idea.why}</p>
            </div>
          ))}
        </div>
      )}
      {page === 'together' && decide && (
        <Overlay label="Decide together" title="Decide together" onClose={() => setPage(null)}>
          <DecideTogether
            store={decide}
            places={places}
            members={members}
            userId={userId}
            names={names}
            lists={lists}
            tags={settingsOf(group).tags}
            initialSessionId={sessionId}
            onOpenPlace={openPlace}
            onPlan={planFromVote}
          />
        </Overlay>
      )}
      {page === 'plans' && decide && (
        <Overlay
          label="Plans"
          title="Plans"
          onClose={() => {
            setDraft(null)
            setPage(null)
          }}
        >
          <PlansPage
            store={decide}
            places={allPlaces}
            members={members}
            userId={userId}
            names={names}
            draft={draft}
            onDraft={setDraft}
            onOpenPlace={openPlace}
            onVoteForPlace={voteForPlan}
          />
        </Overlay>
      )}
      {page === 'crawl' && (
        <Overlay label="Food crawls" title="Food crawls" onClose={() => setPage(null)}>
          <CrawlPlanner
            lists={lists}
            places={allPlaces}
            groupId={groupId}
            userId={userId}
            supabase={supabase}
            demo={demo}
            onLists={onLists}
            onOpenPlace={openPlace}
            onShowOnMap={(id) => {
              setPage(null)
              onShowOnMap(id)
            }}
          />
        </Overlay>
      )}
    </section>
  )
}
