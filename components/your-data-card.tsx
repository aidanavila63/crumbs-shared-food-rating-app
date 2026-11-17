'use client'
import Link from 'next/link'
// #89 Download a backup of the group, #88 delete your account.
import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import type { Group } from '@/hooks/use-crumbs-data'

export function YourDataCard({
  group,
  supabase,
  demo,
  isOwner,
  memberCount,
  onDeleted,
}: {
  group: Group
  supabase: any
  demo: boolean
  isOwner: boolean
  memberCount: number
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState<'export' | 'me' | 'delete' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  function saveFile(data: unknown, name: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  /** #234 Everything you added, across all your groups. */
  async function exportMe() {
    if (demo) return toast('Downloads need the real database, not demo mode')
    setBusy('me')
    const { data, error } = await supabase.rpc('export_me')
    setBusy(null)
    if (error) return toast.error(error.message)
    saveFile(data, 'crumbs-my-data')
    toast.success('Your data downloaded')
  }

  async function exportGroup() {
    if (demo) return toast('Backups need the real database, not demo mode')
    setBusy('export')
    const { data, error } = await supabase.rpc('export_group', { target_group: group.id })
    setBusy(null)
    if (error) return toast.error(error.message)
    saveFile(data, `crumbs-${group.name.replace(/[^\w -]/g, '').trim() || 'group'}`)
    try {
      localStorage.setItem(`crumbs-backup-${group.id}`, new Date().toISOString())
    } catch {}
    toast.success('Backup downloaded')
  }

  const [keepNotes, setKeepNotes] = useState(true)
  async function deleteAccount() {
    if (typed.trim().toUpperCase() !== 'DELETE') return
    if (demo) return toast('Not in demo mode')
    setBusy('delete')
    // Round 78: through the server, so your photo files are removed too.
    const response = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keepNotes }),
    })
    const body = await response.json().catch(() => ({}))
    setBusy(null)
    if (!response.ok) return toast.error(body.error || 'Could not delete your account')
    toast.success('Your account has been deleted')
    onDeleted()
  }

  let last: string | null = null
  try {
    last = localStorage.getItem(`crumbs-backup-${group.id}`)
  } catch {}

  return (
    <section className="surface settings-card">
      <h3 className="settings-heading">Your data</h3>
      <div className="settings-row">
        <span>
          <span className="font-semibold">Back up {group.name}</span>
          <span className="block text-sm text-muted-foreground">
            Every place, rating, dish, visit, list and home meal as one file
            {last ? ` · last one ${new Date(last).toLocaleDateString()}` : ''}.
          </span>
        </span>
        <button
          className="secondary shrink-0 !min-h-10 !px-3 text-sm"
          disabled={busy === 'export'}
          onClick={exportGroup}
          aria-label="Download a backup"
        >
          <Download size={16} />
        </button>
      </div>
      <div className="settings-row">
        <span>
          <span className="font-semibold">Download my data</span>
          <span className="block text-sm text-muted-foreground">
            Everything you’ve added in all your groups — ratings, visits, dishes, private notes,
            home cooking, details you gave restaurants and your points — as one file.
          </span>
        </span>
        <button
          className="secondary shrink-0 !min-h-10 !px-3 text-sm"
          disabled={busy === 'me'}
          onClick={exportMe}
          aria-label="Download my data"
        >
          <Download size={16} />
        </button>
      </div>
      {!confirming ? (
        <button
          className="text-left text-sm font-semibold text-destructive underline"
          onClick={() => setConfirming(true)}
        >
          Delete my account…
        </button>
      ) : (
        <div className="rise-panel flex flex-col gap-2 rounded-2xl border border-destructive/40 p-3">
          {/* Round 78: says exactly what the Privacy Policy says happens. */}
          <div className="flex flex-col gap-1 text-sm">
            <p>
              <strong>Deleted:</strong> your account and profile, your photos, private notes,
              draft ratings, saved areas, settings, reactions and points.
            </p>
            <p>
              <strong>Stays, without your name:</strong> places, lists, plans and visits you
              added, your ratings and scores, and the restaurant details, yes/no answers, prices
              and menu entries you gave — so your groups’ averages and everyone’s restaurant pages
              don’t change.
            </p>
            {isOwner && (
              <p>
                {memberCount > 1
                  ? `You own ${group.name}, so it passes to another member (admins first). Any other group you own does the same.`
                  : `You’re the only one in ${group.name}, so it will be deleted.`}
              </p>
            )}
            <p className="text-muted-foreground">
              Backup copies are overwritten within 8 weeks. This can’t be undone.{' '}
              <Link href="/privacy#how-long-data-is-kept" className="underline">
                Privacy Policy
              </Link>
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={keepNotes}
              onChange={(event) => setKeepNotes(event.target.checked)}
            />
            <span>
              Keep my notes and comments in my groups, without my name
              <span className="block text-xs text-muted-foreground">
                Untick to delete your comments and the notes on your visits too.
              </span>
            </span>
          </label>
          <input
            className="field"
            aria-label="Type DELETE to confirm"
            placeholder="Type DELETE to confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="secondary flex-1"
              onClick={() => {
                setConfirming(false)
                setTyped('')
              }}
            >
              Cancel
            </button>
            <button
              className="primary flex-1 !bg-[#b23a26] !border-[#b23a26]"
              disabled={typed.trim().toUpperCase() !== 'DELETE' || busy === 'delete'}
              onClick={deleteAccount}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
