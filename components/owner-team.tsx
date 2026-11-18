'use client'
// O6 (Round 95): hand over or share a restaurant page. Managers invite someone by their Crumbs
// handle; they accept on their profile; anyone running the page can take someone off or leave
// (the last one leaving makes the page unclaimed again).
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { haptic } from '@/lib/motion'
import { askConfirm } from '@/lib/ask'

type Person = { id: string; name: string; handle: string | null; me?: boolean }
type Team = { managers: Person[]; invites: Person[] }
const notReady = (error: any) => /owner_team|owner_invite|schema cache|PGRST202/i.test(error?.message ?? '')

export function OwnerTeam({
  restaurantId,
  name,
  supabase,
  demo,
  onLeft,
}: {
  restaurantId: string
  name: string
  supabase: any
  demo: boolean
  onLeft: () => void
}) {
  const [team, setTeam] = useState<Team | null>(
    demo ? { managers: [{ id: 'me', name: 'Jordan', handle: 'jordan', me: true }], invites: [] } : null,
  )
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (demo) return
    const { data, error } = await supabase.rpc('owner_team', { target: restaurantId })
    if (!error) setTeam(data)
  }, [demo, supabase, restaurantId])
  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])
  if (!team) return null

  async function invite() {
    const who = handle.trim()
    if (!who) return
    if (demo) return toast('Not available in demo mode')
    setBusy(true)
    const { data, error } = await supabase.rpc('owner_invite_manager', { target: restaurantId, who })
    setBusy(false)
    if (error) return toast.error(notReady(error) ? 'This isn’t switched on yet' : error.message)
    haptic('success')
    toast.success(`Invited ${data?.name ?? 'them'} — they say yes on their profile`)
    setHandle('')
    load()
  }
  async function remove(person: Person) {
    const last = person.me && team!.managers.length === 1
    const question = person.me
      ? last
        ? `Leave ${name}? You’re the only one running it, so it goes back to being unclaimed.`
        : `Leave ${name}? The others keep running it.`
      : `Take ${person.name} off ${name}?`
    if (!(await askConfirm(question, { confirm: person.me ? 'Leave' : 'Take off', danger: true }))) return
    if (demo) return toast('Not available in demo mode')
    const { error } = await supabase.rpc('owner_remove_manager', { target: restaurantId, person: person.id })
    if (error) return toast.error(error.message)
    toast.success(person.me ? `You left ${name}` : `${person.name} is off ${name}`)
    if (person.me) onLeft()
    else load()
  }

  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Who runs this page</h3>
      {team.managers.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1">
            {p.me ? 'You' : p.name}
            {p.handle ? <span className="text-muted-foreground"> · @{p.handle}</span> : null}
          </span>
          <button className="text-xs font-semibold text-destructive underline" onClick={() => remove(p)}>
            {p.me ? 'Leave' : 'Take off'}
          </button>
        </div>
      ))}
      {team.invites.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="min-w-0 flex-1">
            {p.name}
            {p.handle ? ` · @${p.handle}` : ''} — invited
          </span>
          <button className="text-xs font-semibold underline" onClick={() => remove(p)}>
            Cancel
          </button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Handing over, or adding a manager? Invite them by their Crumbs handle (Profile → Public profile). They’ll
        run the page the same as you.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          invite()
        }}
      >
        <input
          className="field min-w-0 flex-1"
          placeholder="@handle"
          aria-label="Their Crumbs handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
        />
        <button className="secondary shrink-0" type="submit" disabled={busy || !handle.trim()}>
          Invite
        </button>
      </form>
    </section>
  )
}

type Invite = { restaurant_id: string; name: string; by: string }

/** On your profile: "Maya invited you to help run Hana Ramen" → Yes / No thanks. */
export function ManagerInvites({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([])
  useEffect(() => {
    if (demo) return
    let live = true
    Promise.resolve(supabase.rpc('my_manager_invites'))
      .then(({ data, error }: any) => live && !error && Array.isArray(data) && setInvites(data))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [demo, supabase])
  if (!invites.length) return null
  async function answer(invite: Invite, yes: boolean) {
    const { error } = await supabase.rpc('answer_manager_invite', { target: invite.restaurant_id, yes })
    if (error) return toast.error(error.message)
    setInvites((all) => all.filter((i) => i.restaurant_id !== invite.restaurant_id))
    if (yes) {
      haptic('success')
      toast.success(`You help run ${invite.name} now — it’s under Your restaurants`)
      setTimeout(() => window.location.reload(), 1200)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {invites.map((i) => (
        <div key={i.restaurant_id} className="surface flex flex-col gap-2 text-sm">
          <p>
            <strong>{i.by}</strong> invited you to help run <strong>{i.name}</strong> on Crumbs.
          </p>
          <div className="flex gap-2">
            <button className="primary flex-1 !min-h-10 text-sm" onClick={() => answer(i, true)}>
              Yes
            </button>
            <button className="secondary flex-1 !min-h-10 text-sm" onClick={() => answer(i, false)}>
              No thanks
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
