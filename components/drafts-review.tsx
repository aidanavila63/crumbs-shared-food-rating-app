'use client'
// #166 Changes made with no signal wait here. Back online: review each one and apply or discard.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { applyDraft, drafts, dropDraft, onDraftsChange, type Draft } from '@/lib/offline-drafts'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'
import { timeAgo } from './social'

export function DraftsReview({ supabase, onApplied }: { supabase: any; onApplied: () => void }) {
  const [list, setList] = useState<Draft[]>([])
  const [online, setOnline] = useState(true)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const update = () => {
      setList(drafts())
      setOnline(navigator.onLine)
    }
    update()
    const off = onDraftsChange(update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      off()
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (!online || !list.length) return null

  async function apply(items: Draft[]) {
    setBusy(true)
    let done = 0
    for (const d of items) {
      const error = await applyDraft(supabase, d)
      if (error) toast.error(`${d.label}: ${error.message}`)
      else done += 1
    }
    setBusy(false)
    if (done) {
      haptic('success')
      toast.success(`Applied ${done} change${done === 1 ? '' : 's'}`)
      onApplied()
    }
  }

  return (
    <>
      <button
        className="next-time-note mb-4 w-full text-left text-sm"
        onClick={() => setOpen(true)}
      >
        📝{' '}
        <strong>
          {list.length} change{list.length === 1 ? '' : 's'} made offline
        </strong>{' '}
        — tap to review and apply
      </button>
      {open && (
        <Overlay label="Offline changes" title="Offline changes" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Made while you had no signal. Apply the ones you still want — others may have changed
              things since.
            </p>
            {list.map((d) => (
              <div key={d.id} className="surface-soft flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-semibold">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">{timeAgo(d.at)}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    className="secondary !min-h-9 !px-3 text-sm"
                    onClick={() => dropDraft(d.id)}
                  >
                    Discard
                  </button>
                  <button
                    className="primary !min-h-9 !px-3 text-sm"
                    disabled={busy}
                    onClick={() => apply([d])}
                  >
                    Apply
                  </button>
                </span>
              </div>
            ))}
            <button className="primary" disabled={busy} onClick={() => apply(list)}>
              {busy ? 'Applying…' : `Apply all ${list.length}`}
            </button>
          </div>
        </Overlay>
      )}
    </>
  )
}
