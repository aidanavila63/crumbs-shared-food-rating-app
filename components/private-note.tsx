'use client'
// #10 Private notes: a note on a place that only you can ever see — not your group, not admins
// (row-level security: your own rows only). Saved when you leave the box; both empty deletes it.
// #179 "Next time" note (ask for extra spicy, skip the fries): shows at the top of the place and
// in Quick log the next time you go.
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'

export type PrivateNoteState = {
  body: string
  nextTime: string
  /** #202 loyalty / punch card */
  loyalty: string
  loaded: boolean
  save: (changes: { body?: string; nextTime?: string; loyalty?: string }) => Promise<void>
}

/** Loads and saves your private note + next-time note for one place. */
export function usePrivateNote({
  placeId,
  userId,
  supabase,
  demo,
}: {
  placeId: string
  userId?: string
  supabase: any
  demo: boolean
}): PrivateNoteState {
  const [note, setNote] = useState({
    body: '',
    nextTime: demo && placeId === 'demo-ramen' ? 'Ask for the egg extra soft' : '',
    loyalty: '',
    loaded: demo,
  })

  useEffect(() => {
    if (demo || !userId || !placeId) return
    let cancelled = false
    supabase
      .from('place_private_notes')
      .select('*')
      .eq('place_id', placeId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!cancelled)
          setNote({
            body: data?.body ?? '',
            nextTime: data?.next_time ?? '',
            loyalty: data?.loyalty ?? '',
            loaded: true,
          })
      })
    return () => {
      cancelled = true
    }
  }, [demo, placeId, supabase, userId])

  async function save(changes: { body?: string; nextTime?: string; loyalty?: string }) {
    const next = {
      body: (changes.body ?? note.body).trim(),
      nextTime: (changes.nextTime ?? note.nextTime).trim().slice(0, 200),
      loyalty: (changes.loyalty ?? note.loyalty).trim().slice(0, 120),
    }
    if (next.body === note.body && next.nextTime === note.nextTime && next.loyalty === note.loyalty)
      return
    setNote({ ...next, loaded: true })
    if (demo || !userId) return
    const { error } =
      next.body || next.nextTime || next.loyalty
        ? await supabase.from('place_private_notes').upsert({
            place_id: placeId,
            user_id: userId,
            body: next.body,
            next_time: next.nextTime || null,
            ...(next.loyalty || note.loyalty ? { loyalty: next.loyalty || null } : {}),
            updated_at: new Date().toISOString(),
          })
        : await supabase
            .from('place_private_notes')
            .delete()
            .match({ place_id: placeId, user_id: userId })
    if (error) toast.error(error.message)
  }

  return { ...note, save }
}

export function PrivateNote({ note }: { note: PrivateNoteState }) {
  const [text, setText] = useState(note.body)
  const [next, setNext] = useState(note.nextTime)
  const [loyalty, setLoyalty] = useState(note.loyalty)
  const [open, setOpen] = useState(!!note.body || !!note.nextTime || !!note.loyalty)
  // Fill in once the saved note arrives.
  const [seen, setSeen] = useState(note.loaded)
  if (note.loaded && !seen) {
    setSeen(true)
    setText(note.body)
    setNext(note.nextTime)
    setLoyalty(note.loyalty)
    if (note.body || note.nextTime || note.loyalty) setOpen(true)
  }

  if (!open)
    return (
      <button
        className="flex items-center gap-1 self-start text-xs font-semibold text-muted-foreground underline"
        onClick={() => setOpen(true)}
      >
        <Lock size={12} /> Add a private note or a “next time” reminder (only you see them)
      </button>
    )
  return (
    <div className="private-note flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">
          📌 Next time — shows up when you come back
        </span>
        <input
          className="field text-base"
          maxLength={200}
          placeholder="Ask for extra spicy, skip the fries…"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          onBlur={() => note.save({ nextTime: next })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">
          🎟️ Loyalty / punch card (only you see it)
        </span>
        <input
          className="field text-base"
          maxLength={120}
          placeholder="e.g. 7 of 10 stamps, free coffee next"
          value={loyalty}
          onChange={(event) => setLoyalty(event.target.value)}
          onBlur={() => note.save({ loyalty })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Lock size={12} /> Private note — only you can see this
        </span>
        <textarea
          className="field min-h-16 text-base"
          maxLength={4000}
          placeholder="Who you went with, the server’s name…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => note.save({ body: text })}
        />
      </label>
    </div>
  )
}
