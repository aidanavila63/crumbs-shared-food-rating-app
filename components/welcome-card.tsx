'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Group } from '@/hooks/use-crumbs-data'

export function WelcomeCard({
  group,
  hasPlaces,
  onAdd,
}: {
  group: Group
  hasPlaces: boolean
  onAdd: () => void
}) {
  const [showTips, setShowTips] = useState(false)

  // Filters hid every place, so this is not a first-run situation.
  if (hasPlaces) {
    return (
      <div className="empty">
        <p className="font-serif text-xl font-bold">Nothing matches</p>
        <p className="mt-2 text-sm text-muted-foreground">Try a different search or filter.</p>
      </div>
    )
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.join_code)
      toast.success('Code copied')
    } catch {
      toast(`Code: ${group.join_code}`)
    }
  }

  return (
    <div className="surface flex flex-col gap-4">
      <div>
        <p className="text-3xl">🍞</p>
        <h2 className="mt-2 font-serif text-2xl font-bold">Welcome to {group.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rate places together, keep a wish list, and see where your tastes match.
        </p>
      </div>
      <ol className="flex flex-col gap-3 text-sm">
        <li className="surface-soft flex items-center justify-between gap-3">
          <span>
            <strong>1.</strong> Add a place you love or want to try
          </span>
          <button className="primary" onClick={onAdd}>
            Add
          </button>
        </li>
        <li className="surface-soft flex items-center justify-between gap-3">
          <span>
            <strong>2.</strong> Invite your partner with code{' '}
            <strong className="tracking-widest">{group.join_code}</strong>
          </span>
          <button className="secondary" onClick={copyCode}>
            Copy
          </button>
        </li>
        <li className="surface-soft">
          <button
            className="w-full text-left"
            aria-expanded={showTips}
            onClick={() => setShowTips((value) => !value)}
          >
            <strong>3.</strong> Put Crumbs on your home screen {showTips ? '▴' : '▾'}
          </button>
          {showTips && (
            <p className="mt-2 text-muted-foreground">
              On iPhone, open this page in Safari, tap the Share button, then{' '}
              <em>Add to Home Screen</em>. Tip: sign in with Google inside the installed app, since
              email links open in Safari.
            </p>
          )}
        </li>
      </ol>
    </div>
  )
}
