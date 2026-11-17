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
  const [code, setCode] = useState('')
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

  // Third pass #3 (Round 78): on an iPhone home-screen app the link opens Safari instead, so the
  // email can also carry a 6-digit code to type here (Supabase's email template needs {{ .Token }}).
  async function signInWithCode() {
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error)
      return toast.error(/expired|invalid/i.test(error.message) ? 'That code didn’t work — it may have expired. Send a new one.' : error.message)
    window.location.href = next
  }

  if (sent)
    return (
      <div className="mt-7 rounded-2xl bg-muted p-4 text-sm">
        <p>
          Magic link sent to <strong>{email}</strong>. Check your inbox (and spam).
        </p>
        <p className="mt-3">If the email shows a 6-digit code, you can type it here instead:</p>
        <div className="mt-2 flex gap-2">
          <input
            className="field min-w-0 flex-1 text-center tracking-[0.3em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label="6-digit code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => event.key === 'Enter' && code.length === 6 && !busy && signInWithCode()}
          />
          <button className="primary !px-4" disabled={code.length !== 6 || busy} onClick={signInWithCode}>
            Sign in
          </button>
        </div>
        <button className="mt-3 underline" onClick={() => setSent(false)}>
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
