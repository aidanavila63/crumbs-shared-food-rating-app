'use client'
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
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  async function exportGroup() {
    if (demo) return toast('Backups need the real database, not demo mode')
    setBusy('export')
    const { data, error } = await supabase.rpc('export_group', { target_group: group.id })
    setBusy(null)
    if (error) return toast.error(error.message)
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `crumbs-${group.name.replace(/[^\w -]/g, '').trim() || 'group'}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    try {
      localStorage.setItem(`crumbs-backup-${group.id}`, new Date().toISOString())
    } catch {}
    toast.success('Backup downloaded')
  }

  async function deleteAccount() {
    if (typed.trim().toUpperCase() !== 'DELETE') return
    if (demo) return toast('Not in demo mode')
    setBusy('delete')
    const { error } = await supabase.rpc('delete_my_account')
    setBusy(null)
    if (error) return toast.error(error.message)
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
      {!confirming ? (
        <button
          className="text-left text-sm font-semibold text-destructive underline"
          onClick={() => setConfirming(true)}
        >
          Delete my account…
        </button>
      ) : (
        <div className="rise-panel flex flex-col gap-2 rounded-2xl border border-destructive/40 p-3">
          <p className="text-sm">
            This removes your account, your ratings, notes, reactions and votes. Places and lists
            you added stay for the group.{' '}
            {isOwner &&
              (memberCount > 1
                ? `You own ${group.name}, so it passes to another member (admins first).`
                : `You’re the only one in ${group.name}, so it will be deleted.`)}{' '}
            This can’t be undone.
          </p>
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
