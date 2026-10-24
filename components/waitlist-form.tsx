'use client'
// #94 Waitlist: strangers leave an email; the admin page lists them. Anyone can add, only admins read.
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [trap, setTrap] = useState('') // hidden field bots fill in
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function join(event: React.FormEvent) {
    event.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setState('error')
      return setMessage('That email doesn’t look right.')
    }
    if (trap) return setState('done')
    setState('busy')
    if (demo) return setState('done')
    const { error } = await createClient()
      .from('waitlist')
      .insert({ email: clean.slice(0, 200), note: note.trim().slice(0, 300) || null })
    // Already on the list counts as success (don't reveal who signed up).
    if (error && error.code !== '23505') {
      setState('error')
      return setMessage('Couldn’t save that just now. Try again in a minute.')
    }
    setState('done')
  }

  if (state === 'done')
    return (
      <div className="surface preview-pop text-center">
        <p className="text-4xl" aria-hidden="true">
          🎉
        </p>
        <p className="mt-2 font-serif text-2xl font-bold">You’re on the list</p>
        <p className="mt-1 text-sm text-muted-foreground">We’ll email you when there’s a spot.</p>
      </div>
    )

  return (
    <form className="surface flex flex-col gap-3" onSubmit={join}>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Email
        <input
          className="field"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Who would you use it with? (optional)
        <input
          className="field"
          placeholder="My partner, my roommates, the work lunch crew…"
          maxLength={300}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        value={trap}
        onChange={(event) => setTrap(event.target.value)}
        name="website"
      />
      {state === 'error' && <p className="text-sm text-destructive">{message}</p>}
      <button className="primary" disabled={state === 'busy'}>
        {state === 'busy' ? 'Adding you…' : 'Join the waitlist'}
      </button>
      <p className="text-xs text-muted-foreground">
        Just your email, only used to let you in. No spam.
      </p>
    </form>
  )
}
