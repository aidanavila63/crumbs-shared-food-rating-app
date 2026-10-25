'use client'
// Decide together page: #30 swipe to match, #40 vote on a list, #34 occasion picker.
// Everyone in the group votes yes/no on the same short list; places everyone said yes to match.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Heart, ListChecks, X } from 'lucide-react'
import { toast } from 'sonner'
import type { List, Place, Profile } from '@/hooks/use-crumbs-data'
import type { DecideStore, Overlap, SwipeSession } from '@/hooks/use-decide'
import { fitsOverlap } from '@/lib/decide-more'
import { useUserLocation } from '@/lib/use-user-location'
import { nextToVote, occasionsFor, sessionResults } from '@/lib/decide'
import { average5 } from '@/lib/ratings'
import { haptic } from '@/lib/motion'
import { useShowScore } from './score-input'
import { timeAgo } from './social'

type Source = { id: string; label: string; pick: (places: Place[]) => Place[]; listId?: string }

const shuffle = <T,>(items: T[]) => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function DecideTogether({
  store,
  places,
  members,
  userId,
  names,
  lists,
  tags,
  onOpenPlace,
  onPlan,
  initialSessionId = null,
}: {
  /** Open straight into this vote (e.g. from a plan). */
  initialSessionId?: string | null
  store: DecideStore
  places: Place[]
  members: Profile[]
  userId?: string
  names: Record<string, string>
  lists: List[]
  tags: string[]
  onOpenPlace: (place: Place) => void
  onPlan: (placeId: string, session: SwipeSession) => void
}) {
  const [view, setView] = useState<{ id: string; mode: 'swipe' | 'list' | 'results' } | null>(
    initialSessionId ? { id: initialSessionId, mode: 'swipe' } : null,
  )
  const memberIds = members.map((m) => m.id)
  const open = store.sessions.filter((s) => s.status === 'open')
  const closed = store.sessions.filter((s) => s.status === 'closed').slice(0, 5)
  const current = store.sessions.find((s) => s.id === view?.id) ?? null

  if (current && view)
    return (
      <SessionView
        key={current.id + view.mode}
        session={current}
        mode={view.mode}
        store={store}
        places={places}
        memberIds={memberIds}
        userId={userId}
        names={names}
        onMode={(mode) => setView({ id: current.id, mode })}
        onBack={() => setView(null)}
        onOpenPlace={onOpenPlace}
        onPlan={onPlan}
      />
    )

  return (
    <div className="stagger flex flex-col gap-4">
      {open.map((session) => {
        const r = sessionResults(session, store.votes, memberIds)
        const left = userId ? nextToVote(session, store.votes, userId).length : 0
        return (
          <div key={session.id} className="surface flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-serif text-2xl font-bold">
                  {session.title || 'Decide together'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {session.place_ids.length} places · started by{' '}
                  {session.created_by === userId ? 'you' : (names[session.created_by] ?? 'someone')}{' '}
                  {timeAgo(session.created_at)}
                </p>
              </div>
              {r.matches.length > 0 && (
                <span className="tag shrink-0">
                  💘 {r.matches.length} match{r.matches.length === 1 ? '' : 'es'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => {
                const done = r.progress[member.id] ?? 0
                return (
                  <span
                    key={member.id}
                    className={`chip chip-sm ${done >= session.place_ids.length ? 'chip-active' : ''}`}
                  >
                    {member.id === userId ? 'You' : member.display_name} {done}/
                    {session.place_ids.length}
                  </span>
                )
              })}
            </div>
            <div className="flex gap-2">
              {left > 0 ? (
                <>
                  <button
                    className="primary flex-1"
                    onClick={() => setView({ id: session.id, mode: 'swipe' })}
                  >
                    <Heart size={18} /> Swipe ({left} left)
                  </button>
                  <button
                    className="secondary"
                    aria-label="Vote as a list"
                    onClick={() => setView({ id: session.id, mode: 'list' })}
                  >
                    <ListChecks size={18} />
                  </button>
                </>
              ) : (
                <button
                  className="primary flex-1"
                  onClick={() => setView({ id: session.id, mode: 'results' })}
                >
                  {r.everyoneDone ? 'See the results 🎉' : 'See results so far'}
                </button>
              )}
            </div>
          </div>
        )
      })}
      <NewSession
        store={store}
        places={places}
        lists={lists}
        tags={tags}
        alone={members.length < 2}
        onStarted={(session) => setView({ id: session.id, mode: 'swipe' })}
      />
      {closed.length > 0 && (
        <div className="surface flex flex-col gap-2">
          <h3 className="settings-heading">Finished</h3>
          {closed.map((session) => {
            const top = sessionResults(session, store.votes, memberIds).ranked[0]
            const place = places.find((p) => p.id === top?.placeId)
            return (
              <button
                key={session.id}
                className="surface-soft flex items-center justify-between gap-2 text-left"
                onClick={() => setView({ id: session.id, mode: 'results' })}
              >
                <span className="min-w-0 truncate font-semibold">
                  {session.title || 'Decide together'}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {place ? `→ ${place.name}` : timeAgo(session.created_at)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewSession({
  store,
  places,
  lists,
  tags,
  alone,
  onStarted,
}: {
  store: DecideStore
  places: Place[]
  lists: List[]
  tags: string[]
  alone: boolean
  onStarted: (session: SwipeSession) => void
}) {
  const sources: Source[] = useMemo(
    () => [
      {
        id: 'want',
        label: 'Want to try',
        pick: (all) => all.filter((p) => p.status === 'Want to try'),
      },
      {
        id: 'faves',
        label: 'Our favourites',
        pick: (all) => all.filter((p) => average5(p.place_ratings) >= 4),
      },
      { id: 'all', label: 'Everything', pick: (all) => all },
      ...lists
        .filter((list) => list.kind !== 'crawl')
        .map((list) => ({
          id: `list:${list.id}`,
          label: `${list.emoji} ${list.name}`,
          listId: list.id,
          pick: (all: Place[]) => {
            const ids = new Set((list.list_places ?? []).map((item) => item.place_id))
            return all.filter((p) => ids.has(p.id))
          },
        })),
    ],
    [lists],
  )
  const occasions = useMemo(() => occasionsFor(tags), [tags])
  const [source, setSource] = useState('want')
  const [occasion, setOccasion] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = sources.find((s) => s.id === source) ?? sources[0]
  const pool = chosen
    .pick(places)
    .filter((p) => p.business_status !== 'CLOSED_PERMANENTLY')
    .filter((p) => !occasion || occasions.find((o) => o.id === occasion)!.test(p))

  async function start() {
    if (pool.length < 2) return toast('Need at least 2 places — try another list or occasion')
    setBusy(true)
    const name =
      title.trim() ||
      [
        occasions.find((o) => o.id === occasion)?.label.replace(/^\S+\s/, ''),
        chosen.label.replace(/^\S+\s/, ''),
      ]
        .filter(Boolean)
        .join(' · ')
    const session = await store.startSession(
      name,
      shuffle(pool)
        .slice(0, 15)
        .map((p) => p.id),
      chosen.listId ?? null,
    )
    setBusy(false)
    if (!session) return
    haptic('success')
    onStarted(session)
  }

  return (
    <div className="surface flex flex-col gap-3">
      <h3 className="font-serif text-2xl font-bold">Start a new one</h3>
      <p className="text-sm text-muted-foreground">
        {alone
          ? 'Invite someone to your group to match. You can still swipe to shortlist.'
          : 'Everyone swipes yes or no on the same places. Places you all like are a match.'}
      </p>
      <input
        className="field"
        aria-label="Name (optional)"
        placeholder="Name it (optional) — e.g. Friday dinner"
        maxLength={80}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <span className="text-sm font-semibold">From</span>
      <div className="chip-row" role="radiogroup" aria-label="Which places">
        {sources.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={source === s.id}
            className={`chip chip-sm ${source === s.id ? 'chip-active' : ''}`}
            onClick={() => setSource(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <span className="text-sm font-semibold">Occasion (optional)</span>
      <div className="chip-row" role="radiogroup" aria-label="Occasion">
        {occasions.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={occasion === o.id}
            className={`chip chip-sm ${occasion === o.id ? 'chip-active' : ''}`}
            onClick={() => setOccasion(occasion === o.id ? null : o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <button className="primary" disabled={busy || pool.length < 2} onClick={start}>
        {pool.length < 2
          ? `Only ${pool.length} place${pool.length === 1 ? '' : 's'} fit`
          : `Start with ${Math.min(15, pool.length)} places`}
      </button>
    </div>
  )
}

function PlaceFace({ place }: { place: Place }) {
  const show = useShowScore()
  const avg = average5(place.place_ratings)
  return (
    <>
      <p className="text-sm font-semibold text-muted-foreground">
        {[place.cuisine, place.price_level ? '$'.repeat(place.price_level) : null, place.status]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <h3 className="font-serif text-4xl font-bold leading-tight">{place.name}</h3>
      {place.formatted_address && (
        <p className="text-sm text-muted-foreground">{place.formatted_address}</p>
      )}
      {avg > 0 && <p className="font-serif text-2xl text-primary">{show(avg)}</p>}
      {(place.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {place.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function SessionView({
  session,
  mode,
  store,
  places,
  memberIds,
  userId,
  names,
  onMode,
  onBack,
  onOpenPlace,
  onPlan,
}: {
  session: SwipeSession
  mode: 'swipe' | 'list' | 'results'
  store: DecideStore
  places: Place[]
  memberIds: string[]
  userId?: string
  names: Record<string, string>
  onMode: (mode: 'swipe' | 'list' | 'results') => void
  onBack: () => void
  onOpenPlace: (place: Place) => void
  onPlan: (placeId: string, session: SwipeSession) => void
}) {
  const byId = (id: string) => places.find((p) => p.id === id)
  const results = sessionResults(session, store.votes, memberIds)
  // #131 your one veto in this vote
  const myVeto = store.votes.find(
    (v) => v.session_id === session.id && v.user_id === userId && v.veto,
  )?.place_id
  // #187 everyone's private limits, overlapped
  const [overlap, setOverlap] = useState<Overlap | null>(null)
  const [limitsOpen, setLimitsOpen] = useState(false)
  const here = useUserLocation(!!overlap?.max_km)
  useEffect(() => {
    let cancelled = false
    store.overlap(session.id).then((o) => !cancelled && setOverlap(o))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, limitsOpen])
  const fits = (place: Place) => fitsOverlap(place, overlap, here)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button className="text-sm font-semibold text-primary underline" onClick={onBack}>
          ← All
        </button>
        <div
          className="segmented segmented-3 !w-auto min-w-0 flex-1"
          role="tablist"
          aria-label="View"
        >
          <span
            className="segmented-thumb"
            aria-hidden="true"
            style={{
              transform: `translateX(${['swipe', 'list', 'results'].indexOf(mode) * 100}%)`,
            }}
          />
          {(['swipe', 'list', 'results'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'segmented-active' : ''}
              onClick={() => onMode(m)}
            >
              {m === 'swipe' ? 'Swipe' : m === 'list' ? 'List' : 'Results'}
            </button>
          ))}
        </div>
      </div>
      <h3 className="font-serif text-2xl font-bold">{session.title || 'Decide together'}</h3>
      <div className="flex flex-col gap-2">
        {overlap?.people ? (
          <p className="next-time-note text-sm">
            🔒 Everyone’s limits ({overlap.people} set):{' '}
            {[
              overlap.max_price ? `up to ${'$'.repeat(overlap.max_price)}` : null,
              overlap.max_km ? `within ${Number(overlap.max_km)} km` : null,
              overlap.cravings?.length ? `craving ${overlap.cravings.join(' or ')}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'no limits'}
            . Places outside them are faded.
          </p>
        ) : null}
        <button
          className="self-start text-sm font-semibold text-primary underline"
          onClick={() => setLimitsOpen(!limitsOpen)}
        >
          {limitsOpen ? 'Close my limits' : '🔒 Set my private limits'}
        </button>
        {limitsOpen && (
          <LimitsForm
            sessionId={session.id}
            store={store}
            cuisines={[
              ...new Set(
                session.place_ids.map((id) => byId(id)?.cuisine).filter(Boolean) as string[],
              ),
            ]}
            onSaved={() => setLimitsOpen(false)}
          />
        )}
      </div>
      {mode === 'swipe' && userId && (
        <SwipeDeck
          session={session}
          store={store}
          userId={userId}
          byId={(id) => {
            const place = byId(id)
            return place && fits(place) ? place : undefined
          }}
          onDone={() => onMode('results')}
        />
      )}
      {mode === 'list' && (
        <div className="stagger flex flex-col gap-2">
          {session.place_ids.map((id) => {
            const place = byId(id)
            if (!place) return null
            const mine = store.votes.find(
              (v) => v.session_id === session.id && v.place_id === id && v.user_id === userId,
            )
            return (
              <div
                key={id}
                className={`surface-soft flex items-center justify-between gap-2 ${fits(place) ? '' : 'opacity-50'}`}
              >
                <button className="min-w-0 text-left" onClick={() => onOpenPlace(place)}>
                  <span className="block truncate font-semibold">{place.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[place.cuisine, place.price_level ? '$'.repeat(place.price_level) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
                <span className="flex shrink-0 gap-2">
                  <button
                    aria-label={myVeto === id ? `Take back your veto` : `Veto ${place.name}`}
                    aria-pressed={myVeto === id}
                    title="One veto each — a vetoed place can’t win"
                    className={`vote-btn ${myVeto === id ? 'vote-veto' : ''} ${myVeto && myVeto !== id ? 'opacity-30' : ''}`}
                    onClick={() => {
                      haptic('select')
                      if (myVeto && myVeto !== id)
                        return toast('You’ve used your veto — tap it again to take it back')
                      store.veto(session.id, myVeto === id ? null : id)
                    }}
                  >
                    🚫
                  </button>
                  <button
                    aria-label={`No to ${place.name}`}
                    aria-pressed={mine?.yes === false}
                    className={`vote-btn vote-no ${mine?.yes === false ? 'vote-on' : ''}`}
                    onClick={() => {
                      haptic('select')
                      store.vote(session.id, id, false)
                    }}
                  >
                    <X size={18} />
                  </button>
                  <button
                    aria-label={`Yes to ${place.name}`}
                    aria-pressed={mine?.yes === true}
                    className={`vote-btn vote-yes ${mine?.yes === true ? 'vote-on' : ''}`}
                    onClick={() => {
                      haptic('select')
                      store.vote(session.id, id, true)
                    }}
                  >
                    <Check size={18} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
      {mode === 'results' && (
        <div className="stagger flex flex-col gap-3">
          {results.matches.length > 0 ? (
            <div className="surface match-card flex flex-col gap-2 text-center">
              <p className="match-burst" aria-hidden="true">
                💘
              </p>
              <p className="font-serif text-2xl font-bold">
                {results.matches.length === 1
                  ? 'It’s a match!'
                  : `${results.matches.length} matches!`}
              </p>
              {results.matches.map((m) => {
                const place = byId(m.placeId)
                return (
                  place && (
                    <div
                      key={m.placeId}
                      className="surface-soft flex items-center justify-between gap-2 text-left"
                    >
                      <button
                        className="min-w-0 truncate font-semibold"
                        onClick={() => onOpenPlace(place)}
                      >
                        {place.name}
                      </button>
                      <button
                        className="primary shrink-0 !min-h-10 !px-4 text-sm"
                        onClick={() => onPlan(place.id, session)}
                      >
                        Plan it
                      </button>
                    </div>
                  )
                )
              })}
            </div>
          ) : (
            <p className="surface-soft text-sm">
              {results.everyoneDone
                ? 'No place got a yes from everyone. Here’s how the votes landed:'
                : 'No matches yet — waiting on votes.'}
            </p>
          )}
          {results.ranked
            .filter((row) => !row.match)
            .map((row) => {
              const place = byId(row.placeId)
              if (!place) return null
              return (
                <div
                  key={row.placeId}
                  className="surface-soft flex items-center justify-between gap-2"
                >
                  <button
                    className="min-w-0 truncate text-left font-semibold"
                    onClick={() => onOpenPlace(place)}
                  >
                    {row.match ? '💘 ' : ''}
                    {row.vetoedBy.length ? '🚫 ' : ''}
                    {place.name}
                    {row.vetoedBy.length > 0 && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        Vetoed by{' '}
                        {row.vetoedBy.map((u) => (u === userId ? 'you' : names[u])).join(', ')}
                      </span>
                    )}
                  </button>
                  <span className="flex shrink-0 items-center gap-2 text-sm">
                    <span title={row.yes.map((u) => (u === userId ? 'You' : names[u])).join(', ')}>
                      👍 {row.yes.length}
                    </span>
                    <span className="text-muted-foreground">👎 {row.no.length}</span>
                    {!row.match && !row.vetoedBy.length && row.yes.length > 0 && (
                      <button
                        className="text-xs font-bold text-primary underline"
                        onClick={() => onPlan(place.id, session)}
                      >
                        Plan
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          <div className="flex gap-2">
            {session.status === 'open' ? (
              <button className="secondary flex-1" onClick={() => store.closeSession(session.id)}>
                Finish voting
              </button>
            ) : (
              <button
                className="secondary flex-1"
                onClick={() => store.closeSession(session.id, 'open')}
              >
                Reopen
              </button>
            )}
            {session.created_by === userId && (
              <button
                className="secondary text-destructive"
                onClick={() => {
                  if (!window.confirm('Delete this vote for everyone?')) return
                  store.deleteSession(session.id)
                  onBack()
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** #30 One card at a time. Drag left/right or tap ✕ / ♥ (buttons work without swiping). */
function SwipeDeck({
  session,
  store,
  userId,
  byId,
  onDone,
}: {
  session: SwipeSession
  store: DecideStore
  userId: string
  byId: (id: string) => Place | undefined
  onDone: () => void
}) {
  const queue = nextToVote(session, store.votes, userId).filter((id) => byId(id))
  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState<'yes' | 'no' | null>(null)
  const start = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const id = queue[0]
  const place = id ? byId(id) : undefined
  const peek = queue[1] ? byId(queue[1]) : undefined
  const total = session.place_ids.length

  function decide(yes: boolean) {
    if (!id || leaving) return
    haptic(yes ? 'success' : 'tap')
    setLeaving(yes ? 'yes' : 'no')
    setTimeout(() => {
      store.vote(session.id, id, yes)
      setLeaving(null)
      setDrag(0)
    }, 220)
  }

  if (!place)
    return (
      <div className="surface flex flex-col items-center gap-3 text-center">
        <p className="text-5xl" aria-hidden="true">
          🙌
        </p>
        <p className="font-serif text-2xl font-bold">All done!</p>
        <p className="text-sm text-muted-foreground">You’ve voted on every place.</p>
        <button className="primary" onClick={onDone}>
          See results
        </button>
      </div>
    )

  const x = leaving === 'yes' ? 480 : leaving === 'no' ? -480 : drag
  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-muted-foreground">
        {total - queue.length + 1} of {total}
      </p>
      <div className="swipe-stack">
        {peek && (
          <div className="swipe-card swipe-peek surface" aria-hidden="true">
            <PlaceFace place={peek} />
          </div>
        )}
        <div
          key={id}
          className={`swipe-card surface ${dragging ? '' : 'swipe-settle'}`}
          style={{ transform: `translateX(${x}px) rotate(${x / 18}deg)` }}
          onPointerDown={(event) => {
            start.current = event.clientX
            setDragging(true)
            ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
          }}
          onPointerMove={(event) =>
            start.current !== null && setDrag(event.clientX - start.current)
          }
          onPointerUp={() => {
            const moved = drag
            start.current = null
            setDragging(false)
            if (Math.abs(moved) > 90) decide(moved > 0)
            else setDrag(0)
          }}
          onPointerCancel={() => {
            start.current = null
            setDragging(false)
            setDrag(0)
          }}
        >
          <span
            className="swipe-stamp swipe-stamp-yes"
            style={{ opacity: Math.max(0, Math.min(1, x / 90)) }}
          >
            YES
          </span>
          <span
            className="swipe-stamp swipe-stamp-no"
            style={{ opacity: Math.max(0, Math.min(1, -x / 90)) }}
          >
            NOPE
          </span>
          <PlaceFace place={place} />
        </div>
      </div>
      <div className="flex justify-center gap-6">
        <button
          className="swipe-btn swipe-btn-no"
          aria-label={`No to ${place.name}`}
          onClick={() => decide(false)}
        >
          <X size={30} strokeWidth={2.6} />
        </button>
        <button
          className="swipe-btn swipe-btn-yes"
          aria-label={`Yes to ${place.name}`}
          onClick={() => decide(true)}
        >
          <Heart size={30} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  )
}

/** #187 Your private limits for this vote — nobody else sees them, only the overlap. */
function LimitsForm({
  sessionId,
  store,
  cuisines,
  onSaved,
}: {
  sessionId: string
  store: DecideStore
  cuisines: string[]
  onSaved: () => void
}) {
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [maxKm, setMaxKm] = useState<number | null>(null)
  const [cravings, setCravings] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    store.myLimits(sessionId).then((mine) => {
      if (mine) {
        setMaxPrice(mine.max_price)
        setMaxKm(mine.max_km ? Number(mine.max_km) : null)
        setCravings(mine.cravings ?? [])
      }
      setLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])
  const chip = (on: boolean) => `chip chip-sm ${on ? 'chip-active' : ''}`
  if (!loaded) return null
  return (
    <div className="surface-soft rise-panel flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Only you see these. The group only sees where everyone’s limits overlap.
      </p>
      <div className="chip-row" role="radiogroup" aria-label="Budget">
        {[null, 1, 2, 3].map((n) => (
          <button key={String(n)} className={chip(maxPrice === n)} onClick={() => setMaxPrice(n)}>
            {n ? `Up to ${'$'.repeat(n)}` : 'Any price'}
          </button>
        ))}
      </div>
      <div className="chip-row" role="radiogroup" aria-label="Distance">
        {[null, 1, 3, 5, 10].map((n) => (
          <button key={String(n)} className={chip(maxKm === n)} onClick={() => setMaxKm(n)}>
            {n ? `Within ${n} km` : 'Any distance'}
          </button>
        ))}
      </div>
      {cuisines.length > 0 && (
        <div className="chip-row" aria-label="Craving">
          {cuisines.map((c) => {
            const on = cravings.includes(c.toLowerCase())
            return (
              <button
                key={c}
                aria-pressed={on}
                className={chip(on)}
                onClick={() =>
                  setCravings((all) =>
                    on ? all.filter((x) => x !== c.toLowerCase()) : [...all, c.toLowerCase()],
                  )
                }
              >
                {c}
              </button>
            )
          })}
        </div>
      )}
      <button
        className="primary"
        onClick={async () => {
          await store.setLimits(sessionId, { max_price: maxPrice, max_km: maxKm, cravings })
          haptic('success')
          toast.success('Saved — only the overlap is shown')
          onSaved()
        }}
      >
        Save my limits
      </button>
    </div>
  )
}
