'use client'
import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Email magic link + Google sign-in. `next` = where to land after signing in (a Crumbs path,
 * e.g. the invite page). If the sign-in service won't send you back there, Crumbs still does:
 * the invite is remembered on the phone and the app forwards you to it.
 */
export function SignInForm({ supabase, next = '/' }: { supabase: any; next?: string }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const callback = () => {
    const base =
      process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${location.origin}/auth/callback`
    return next === '/' ? base : `${base}?next=${encodeURIComponent(next)}`
  }

  async function magic() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback() },
    })
    setBusy(false)
    if (error) toast.error(error.message)
    else setSent(true)
  }

  if (sent)
    return (
      <div className="mt-7 rounded-2xl bg-muted p-4 text-sm">
        <p>
          Magic link sent to <strong>{email}</strong>. Check your inbox (and spam).
        </p>
        <button className="mt-2 underline" onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    )
  return (
    <>
      <input
        aria-label="Email address"
        onKeyDown={(event) => event.key === 'Enter' && email && !busy && magic()}
        className="field mt-7"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button className="primary mt-3 w-full" disabled={!email || busy} onClick={magic}>
        {busy ? 'Sending…' : 'Send magic link'}
      </button>
      <button
        className="secondary mt-3 w-full"
        onClick={async () => {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: callback() },
          })
          if (error) toast.error(error.message)
        }}
      >
        Continue with Google
      </button>
    </>
  )
}
