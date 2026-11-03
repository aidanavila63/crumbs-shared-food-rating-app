'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { clearJoinCode, invitePath, rememberInvite } from '@/lib/invite'
import { haptic } from '@/lib/motion'
import { Wordmark } from './wordmark'
import { SignInForm } from './sign-in-form'

export type InvitePreview = {
  name: string
  emoji: string | null
  color: string | null
  description: string | null
  /** a guest link: view-only */
  guest: boolean
  /** the owner lets each person in */
  approval: boolean
  owner: string | null
  members: number
  places: number
  member: boolean
  requested: boolean
  /** only once you're in */
  id: string | null
  /** Crumbs itself: new people wait for the gatekeeper's OK (after the approval SQL) */
  gate?: boolean
  /** where you stand with Crumbs (null when signed out) */
  access?: 'approved' | 'pending' | 'declined' | null
  /** you've asked the gatekeeper */
  asked?: boolean
  /** Crumbs isn't taking new people */
  closed?: boolean
  gatekeeper?: string | null
}

const POLL = 10_000
const POLL_FOR = 30 * 60_000

/** Open the app on this group. */
function enter(id: string) {
  try {
    localStorage.setItem('crumbs-group', id)
  } catch {}
  clearJoinCode()
  window.location.replace('/')
}

export function InviteLanding({
  code,
  initial,
  signedIn,
  demo,
}: {
  code: string
  initial: InvitePreview | null
  signedIn: boolean
  demo: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [preview, setPreview] = useState(initial)
  const [email, setEmail] = useState<string | null>(null)
  const [signed, setSigned] = useState(signedIn)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (demo) return null
    const { data } = await supabase.rpc('invite_preview', { code })
    if (data) setPreview(data as InvitePreview)
    return (data as InvitePreview | null) ?? null
  }, [code, demo, supabase])

  // Remember the invite through sign-in (the magic link can open a fresh page).
  useEffect(() => {
    if (initial) rememberInvite(code)
    else clearJoinCode()
  }, [code, initial])

  useEffect(() => {
    if (demo) return
    supabase.auth.getUser().then(({ data }: any) => {
      setSigned(!!data.user)
      setEmail(data.user?.email ?? null)
    })
    const { data } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      setSigned(!!session?.user)
      setEmail(session?.user?.email ?? null)
      if (session?.user) refresh()
    })
    return () => data.subscription.unsubscribe()
  }, [demo, refresh, supabase])

  // Already in (or just let in): straight into the app.
  useEffect(() => {
    if (!signed || !preview?.member || !preview.id) return
    const id = preview.id
    const timer = setTimeout(() => enter(id), 900)
    return () => clearTimeout(timer)
  }, [signed, preview?.member, preview?.id])

  // Not let into Crumbs yet (everyone new waits for the gatekeeper's OK, then the group's rule).
  const needsOk = signed && !!preview?.access && preview.access !== 'approved' && !preview.member
  const waitingApp = needsOk && !!preview?.asked && preview?.access === 'pending'
  // Waiting to be let in: check every 10 s while the page is open (for up to 30 minutes).
  const waiting = signed && !!preview?.requested && !preview.member
  const polling = waiting || waitingApp
  useEffect(() => {
    if (!polling) return
    const started = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_FOR) return clearInterval(timer)
      if (document.visibilityState === 'visible') refresh()
    }, POLL)
    const onShow = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [polling, refresh])

  async function join() {
    if (!preview) return
    if (demo) return toast('Joining needs the real database, not demo mode')
    setBusy(true)
    const { data, error } = await supabase.rpc('join_by_invite', { code })
    setBusy(false)
    if (error) return toast.error(error.message)
    haptic('success')
    if (data?.status === 'pending_app') {
      setPreview({ ...preview, asked: true })
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'access_request' }),
      }).catch(() => {})
      return
    }
    if (data?.status === 'requested') {
      setPreview({ ...preview, requested: true })
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'join_request', code }),
      }).catch(() => {})
      return
    }
    setPreview({ ...preview, member: true, id: data?.id ?? null })
  }

  async function cancel() {
    if (!preview) return
    setBusy(true)
    const { error } = waitingApp
      ? await supabase.rpc('cancel_access_request')
      : await supabase.rpc('cancel_join_by_invite', { code })
    setBusy(false)
    if (error) return toast.error(error.message)
    setPreview({ ...preview, requested: false, asked: false })
    clearJoinCode()
    toast('Request cancelled')
  }

  if (!preview)
    return (
      <main className="grid min-h-screen place-items-center bg-background p-5">
        <div className="surface w-full max-w-sm">
          <Wordmark height={38} />
          <h1 className="mt-8 font-serif text-3xl font-bold">This invite doesn’t work any more</h1>
          <p className="mt-3 leading-6 text-muted-foreground">
            The link may be old or the group reset its code. Ask whoever sent it for a new one.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/welcome" className="primary text-center">
              What is Crumbs?
            </Link>
            <Link href="/" className="secondary text-center">
              I already use Crumbs
            </Link>
          </div>
        </div>
      </main>
    )

  const owner = preview.owner || 'The owner'
  const keeper = preview.gatekeeper || 'The Crumbs team'
  const asks = preview.approval || needsOk
  const action = asks ? 'Ask to join' : `Join ${preview.name}`
  const after = preview.approval
    ? `${owner} lets you into ${preview.name}`
    : `you’ll go straight into ${preview.name}`

  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <div className="surface invite-card w-full max-w-sm">
        <Wordmark height={34} />
        <div className="invite-hero mt-7">
          <span
            className="invite-badge"
            aria-hidden="true"
            style={preview.color ? { background: preview.color } : undefined}
          >
            {preview.emoji || '🍽️'}
          </span>
          <p className="text-sm font-semibold text-muted-foreground">You’re invited to</p>
          <h1 className="font-serif text-4xl font-bold leading-tight">{preview.name}</h1>
          <p className="text-sm text-muted-foreground">
            {preview.owner ? `${preview.owner}’s group · ` : ''}
            {preview.members} {preview.members === 1 ? 'member' : 'members'} · {preview.places}{' '}
            {preview.places === 1 ? 'place' : 'places'}
          </p>
          {preview.description && <p className="mt-1 leading-6">{preview.description}</p>}
        </div>

        {preview.guest && (
          <p className="next-time-note mt-4 text-sm">
            👀 You’ll join as a guest: you can look around, but not add or change anything.
          </p>
        )}

        {preview.member && signed ? (
          <div className="mt-6 flex flex-col gap-3" role="status">
            <p className="font-semibold">🎉 You’re in! Opening Crumbs…</p>
            <button className="primary w-full" onClick={() => preview.id && enter(preview.id)}>
              Open Crumbs
            </button>
          </div>
        ) : waitingApp ? (
          <div className="mt-6 flex flex-col gap-3" role="status">
            <p className="invite-waiting">
              <span className="invite-dot" aria-hidden="true" />
              Waiting for {keeper} to let you into Crumbs
            </p>
            <p className="text-sm text-muted-foreground">
              Everyone new to Crumbs gets a quick OK first. Once {keeper} says yes, {after}. Keep
              this page open, or come back to this link later.
            </p>
            <button className="secondary w-full" disabled={busy} onClick={cancel}>
              Cancel request
            </button>
          </div>
        ) : needsOk && preview.access === 'declined' ? (
          <div className="mt-6 flex flex-col gap-3" role="status">
            <p className="font-semibold">Crumbs isn’t open to this account right now</p>
            <p className="text-sm text-muted-foreground">
              If you think that’s a mistake, ask whoever sent the link to check with {keeper}.
            </p>
          </div>
        ) : needsOk && preview.closed ? (
          <div className="mt-6 flex flex-col gap-3" role="status">
            <p className="font-semibold">Crumbs isn’t taking new people right now</p>
            <Link href="/welcome#waitlist" className="primary text-center">
              Join the waitlist
            </Link>
          </div>
        ) : waiting ? (
          <div className="mt-6 flex flex-col gap-3" role="status">
            <p className="invite-waiting">
              <span className="invite-dot" aria-hidden="true" />
              Waiting for {owner} to let you in
            </p>
            <p className="text-sm text-muted-foreground">
              You’ll go straight into Crumbs once they say yes. Keep this page open, or come back to
              this link later.
            </p>
            <button className="secondary w-full" disabled={busy} onClick={cancel}>
              Cancel request
            </button>
          </div>
        ) : signed ? (
          <div className="mt-6 flex flex-col gap-3">
            {needsOk ? (
              <p className="text-sm text-muted-foreground">
                {keeper} lets each new person into Crumbs. Ask, and once they say yes, {after}.
              </p>
            ) : (
              preview.approval && (
                <p className="text-sm text-muted-foreground">
                  {owner} lets people in one by one. Ask, and you’ll get in as soon as they say yes.
                </p>
              )
            )}
            <button className="primary w-full" disabled={busy} onClick={join}>
              {busy ? 'One moment…' : action}
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <p className="font-semibold">
              Sign in to {preview.approval || preview.gate ? 'ask to join' : 'join'}
            </p>
            <p className="text-sm text-muted-foreground">
              New to Crumbs? Use any email — it makes your account.
            </p>
            <SignInForm supabase={supabase} next={invitePath(code)} />
          </div>
        )}

        {signed && !preview.member && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            {email ? `Signed in as ${email}. ` : ''}
            <button
              className="underline"
              onClick={async () => {
                await supabase.auth.signOut()
                setSigned(false)
                setEmail(null)
              }}
            >
              Not you? Sign out
            </button>
          </p>
        )}
        {!signed && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Crumbs is a shared food map: rate places together, decide where to eat and remember the
            good ones.{' '}
            <Link href="/welcome" className="underline">
              More
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}
