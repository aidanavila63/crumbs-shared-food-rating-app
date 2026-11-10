'use client'
// #100 the owner's claim request, used on the restaurant profile (in Crumbs) and on the public
// /r/… page. Kept in its own file so the public page doesn't load the whole profile.
import { useState } from 'react'
import { toast } from 'sonner'
import { claimRestaurant } from '@/lib/restaurants'
import { track } from '@/lib/analytics'

/** #100 "Own or manage this place?" — a request an admin checks before the owner gets control. */
export function ClaimForm({
  restaurantId,
  name,
  supabase,
  direct = false,
  startOpen = false,
}: {
  restaurantId: string
  name: string
  supabase: any
  /** from the public page: no need to have saved it to a group first */
  direct?: boolean
  startOpen?: boolean
}) {
  const [open, setOpen] = useState(startOpen)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ contact: '', job: '', mail: '', tel: '', evidence: '' })
  const set = (k: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [k]: event.target.value })
  if (sent)
    return (
      <p className="mt-3 rounded-xl bg-[var(--card)] px-3 py-2 text-sm">
        Thanks — we’ll check your claim and let you know. Once confirmed, your changes go live
        straight away.
      </p>
    )
  if (!open)
    return (
      <button
        className="mt-3 self-start text-sm font-semibold text-primary underline"
        onClick={() => setOpen(true)}
      >
        Own or manage {name}? Claim this page
      </button>
    )
  return (
    <div className="rise-panel mt-3 flex flex-col gap-2 rounded-2xl bg-[var(--card)] p-3">
      <p className="font-semibold">Claim {name}</p>
      <p className="text-xs text-muted-foreground">
        We check every claim (usually by emailing or calling the restaurant). Once confirmed you can
        keep hours, menu and details right for everyone.
      </p>
      <input
        className="field !min-h-10 text-sm"
        aria-label="Your name"
        placeholder="Your name"
        maxLength={120}
        value={form.contact}
        onChange={set('contact')}
      />
      <input
        className="field !min-h-10 text-sm"
        aria-label="Your role"
        placeholder="Role (owner, manager…)"
        maxLength={60}
        value={form.job}
        onChange={set('job')}
      />
      <input
        className="field !min-h-10 text-sm"
        aria-label="Work email"
        type="email"
        placeholder="Work email (ideally at the restaurant’s website)"
        maxLength={200}
        value={form.mail}
        onChange={set('mail')}
      />
      <input
        className="field !min-h-10 text-sm"
        aria-label="Restaurant phone"
        inputMode="tel"
        placeholder="Restaurant phone we can call"
        maxLength={40}
        value={form.tel}
        onChange={set('tel')}
      />
      <textarea
        className="field min-h-16 text-sm"
        aria-label="Anything that shows it’s yours"
        placeholder="Anything that shows it’s yours (optional)"
        maxLength={1000}
        value={form.evidence}
        onChange={set('evidence')}
      />
      <div className="flex gap-2">
        <button className="secondary !min-h-10 text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          className="primary !min-h-10 flex-1 text-sm"
          disabled={busy || !form.contact.trim() || (!form.mail.trim() && !form.tel.trim())}
          onClick={async () => {
            setBusy(true)
            try {
              await claimRestaurant(supabase, restaurantId, form, direct)
              track('claim_sent')
              setSent(true)
            } catch (error: any) {
              toast.error(error?.message || 'Could not send that')
            } finally {
              setBusy(false)
            }
          }}
        >
          Send claim
        </button>
      </div>
    </div>
  )
}
