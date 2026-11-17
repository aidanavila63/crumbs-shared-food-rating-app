'use client'
// Round 78 (liability: "give people a way to report a wrong detail, and act on reports quickly"):
// report a restaurant detail that's wrong. Goes to Admin → Reports. A reported allergen or diet
// detail is hidden for everyone until an admin has looked.
import { useState } from 'react'
import { toast } from 'sonner'
import { isSensitive } from '@/lib/good-to-know'
import { haptic } from '@/lib/motion'

const GENERAL = [
  ['hours', 'Opening hours'],
  ['address', 'Address or map pin'],
  ['phone', 'Phone or website'],
  ['menu', 'Menu or prices'],
  ['photo', 'A photo'],
  ['closed', 'It has closed'],
  ['other', 'Something else'],
] as const

export function ReportDetail({
  restaurantId,
  facts,
  supabase,
  demo,
  onReported,
}: {
  restaurantId: string
  /** the Good to know details on show, to pick from */
  facts: { key?: string; label: string }[]
  supabase: any
  demo: boolean
  onReported?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!detail) return
    if (demo) {
      setOpen(false)
      return toast.success('Thanks — reported')
    }
    setBusy(true)
    const { error } = await supabase.from('detail_reports').insert({
      restaurant_id: restaurantId,
      detail,
      sensitive: isSensitive(detail),
      note: note.trim().slice(0, 300) || null,
    })
    setBusy(false)
    if (error) return toast.error(/detail_reports/.test(error.message) ? 'Reporting isn’t switched on yet' : error.message)
    haptic('success')
    toast.success(isSensitive(detail) ? 'Thanks — it’s hidden until it’s checked' : 'Thanks — it’ll be checked')
    setOpen(false)
    setDetail('')
    setNote('')
    onReported?.()
  }

  if (!open)
    return (
      <button className="self-start text-xs text-muted-foreground underline" onClick={() => setOpen(true)}>
        Report a wrong detail
      </button>
    )
  return (
    <div className="rise-panel flex flex-col gap-2 rounded-2xl border border-[var(--border)] p-3">
      <p className="text-sm font-semibold">What’s wrong?</p>
      <select className="field" aria-label="Which detail" value={detail} onChange={(e) => setDetail(e.target.value)}>
        <option value="">Pick one…</option>
        {facts
          .filter((f) => f.key)
          .map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        {GENERAL.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="field"
        maxLength={300}
        placeholder="What’s right? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="secondary !min-h-10 text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="primary !min-h-10 flex-1 text-sm" disabled={!detail || busy} onClick={send}>
          Send report
        </button>
      </div>
    </div>
  )
}
