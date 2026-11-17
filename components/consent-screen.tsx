'use client'
// Round 78 (the draft's "What the app must do" #1 and the separate allergen tick box): once after
// signing in, and again whenever the wording's version changes, everyone agrees to the Terms and
// Privacy Policy and ticks the allergen line. Stored on their account with the date.
// Admin → Feature switches → consent_screen: Admin = only admins see it (to check it first),
// Everyone = everyone. Off until the wording is final.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { LEGAL_VERSION } from '@/lib/legal-text'
import { haptic } from '@/lib/motion'
import { Wordmark } from './wordmark'

/** null = still checking; true = ask now. */
export function useConsentNeeded(supabase: any, userId: string | undefined, demo: boolean) {
  const [needed, setNeeded] = useState<boolean | null>(demo ? false : null)
  const check = useCallback(async () => {
    if (demo || !userId) return setNeeded(false)
    const [flag, terms, me] = await Promise.all([
      supabase.from('feature_flags').select('state').eq('key', 'consent_screen').maybeSingle(),
      supabase.rpc('my_terms'),
      supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle(),
    ])
    // Before the Round 78 SQL (no switch, no function): never block anyone.
    if (flag.error || terms.error || !flag.data) return setNeeded(false)
    const on = flag.data.state === 'everyone' || (flag.data.state === 'admin' && !!me.data?.is_admin)
    setNeeded(on && terms.data?.version !== LEGAL_VERSION)
  }, [demo, supabase, userId])
  useEffect(() => {
    check()
  }, [check])
  return { needed, done: () => setNeeded(false) }
}

export function ConsentScreen({ supabase, onDone, onSignOut }: { supabase: any; onDone: () => void; onSignOut: () => void }) {
  const [terms, setTerms] = useState(false)
  const [allergen, setAllergen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function agree() {
    setBusy(true)
    const { error } = await supabase.rpc('accept_terms', { version: LEGAL_VERSION, allergen })
    setBusy(false)
    if (error) return toast.error(error.message)
    haptic('success')
    onDone()
  }
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <div className="surface flex w-full max-w-sm flex-col gap-4">
        <Wordmark height={34} />
        <h1 className="font-serif text-3xl font-bold">Before you start</h1>
        <p className="leading-6 text-muted-foreground">
          Crumbs is run by one person. Please read how it works and what happens to what you add.
        </p>
        <div className="flex flex-col gap-1 text-sm font-semibold">
          <Link href="/terms" target="_blank" className="text-primary underline">
            Terms of Use
          </Link>
          <Link href="/privacy" target="_blank" className="text-primary underline">
            Privacy Policy
          </Link>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-5 shrink-0" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>I am 13 or older (with a parent’s or guardian’s permission if I’m under 18) and I agree to the Terms of Use and Privacy Policy.</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-5 shrink-0" checked={allergen} onChange={(e) => setAllergen(e.target.checked)} />
          <span>
            I understand that Crumbs isn’t connected to any restaurant: its details, including
            allergen and diet labels, come from other members and aren’t checked, and the labels are
            only a convenience for narrowing down options. <strong>I will always check with the
            restaurant.</strong>
          </span>
        </label>
        <button className="primary" disabled={!terms || !allergen || busy} onClick={agree}>
          {busy ? 'Saving…' : 'Agree and continue'}
        </button>
        <button className="text-sm text-muted-foreground underline" onClick={onSignOut}>
          Not now — sign out
        </button>
      </div>
    </main>
  )
}
