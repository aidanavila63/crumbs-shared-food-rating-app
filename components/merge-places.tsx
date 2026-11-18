'use client'
// U13 (Round 95): "Same place twice?" — merge another copy into this one. Visits, ratings, dishes,
// notes, lists and plans move over; this one's details win, empty ones are filled from the other;
// the other goes to Recently deleted.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { askConfirm } from '@/lib/ask'
import { duplicateCandidates } from '@/lib/merge'
import { Overlay } from './overlay'

export function MergePlaces({
  place,
  places,
  supabase,
  demo,
  canMerge,
  onMerged,
}: {
  place: Place
  places: Place[]
  supabase: any
  demo: boolean
  /** may this person merge the other one away (U12)? */
  canMerge: (other: Place) => boolean
  onMerged: (otherId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useMemo(() => duplicateCandidates(place, places, q).filter((c) => canMerge(c.place)), [place, places, q, canMerge])

  async function merge(other: Place) {
    if (!(await askConfirm(`Merge “${other.name}” into this one? Its visits, ratings, dishes and notes move here.`, { confirm: 'Merge' })))
      return
    if (demo) {
      setOpen(false)
      onMerged(other.id)
      return toast.success('Merged')
    }
    setBusy(true)
    const { error } = await supabase.rpc('merge_places', { keep: place.id, other: other.id })
    setBusy(false)
    if (error)
      return toast.error(/merge_places|schema cache|PGRST202/i.test(error.message ?? '') ? 'Merging isn’t switched on yet' : error.message)
    haptic('success')
    toast.success(`Merged — “${other.name}” is in Recently deleted if you need it back`)
    setOpen(false)
    onMerged(other.id)
  }

  return (
    <>
      <button className="self-center text-xs text-muted-foreground underline" onClick={() => setOpen(true)}>
        Same place twice? Merge
      </button>
      {open && (
        <Overlay label="Merge places" title="Merge into this one" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Pick the other copy of <strong>{place.name}</strong>. Likely matches come first.
            </p>
            <input
              className="field"
              placeholder="Search your places"
              aria-label="Search your places"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
            <div className="flex flex-col gap-2">
              {list.slice(0, 30).map(({ place: p, likely }) => (
                <button key={p.id} className="owner-row text-left" disabled={busy} onClick={() => merge(p)}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[likely ? 'Looks like the same place' : null, p.formatted_address, p.status].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
              {!list.length && <p className="text-sm text-muted-foreground">Nothing to merge with.</p>}
            </div>
          </div>
        </Overlay>
      )}
    </>
  )
}
