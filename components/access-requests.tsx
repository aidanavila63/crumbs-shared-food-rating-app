'use client'
// People waiting to get into Crumbs: only the gatekeeper (Aidan) says yes or no. Everyone else
// gets an empty list from the database, so this shows nothing for them.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { haptic } from '@/lib/motion'
import { timeAgo } from './social'

type Asking = {
  user_id: string
  display_name: string
  email: string | null
  note: string | null
  group_name: string | null
  role: 'member' | 'guest'
  created_at: string
}
type SaidNo = { user_id: string; display_name: string; email: string | null }

export function AccessRequestsCard({
  supabase,
  demo,
  full = false,
  onReload,
}: {
  supabase: any
  demo: boolean
  /** Admin page: also show "nobody waiting" and the people you said no to. */
  full?: boolean
  onReload?: () => void
}) {
  const [asking, setAsking] = useState<Asking[]>([])
  const [saidNo, setSaidNo] = useState<SaidNo[]>([])
  const [keeper, setKeeper] = useState(false)
  const [showNo, setShowNo] = useState(false)

  const load = useCallback(async () => {
    if (demo) return
    // Before the approval SQL has run this fails: show nothing.
    const { data, error } = await supabase.rpc('access_request_list')
    if (error) return
    setAsking(data ?? [])
    if (full) {
      const [{ data: access }, { data: no }] = await Promise.all([
        supabase.rpc('my_access'),
        supabase.rpc('declined_people'),
      ])
      setKeeper(!!access?.is_gatekeeper)
      setSaidNo(no ?? [])
    }
  }, [demo, full, supabase])
  useEffect(() => {
    load()
    // Coming back to Crumbs (e.g. from the "wants to join Crumbs" notification): look again.
    const onShow = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [load])

  async function answer(person: { user_id: string; display_name: string }, accept: boolean) {
    const { data, error } = await supabase.rpc('answer_access', { person: person.user_id, accept })
    if (error) return toast.error(error.message)
    haptic(accept ? 'success' : 'tap')
    setAsking((all) => all.filter((x) => x.user_id !== person.user_id))
    setSaidNo((all) =>
      accept
        ? all.filter((x) => x.user_id !== person.user_id)
        : [{ user_id: person.user_id, display_name: person.display_name, email: null }, ...all],
    )
    if (!accept) return toast(`Said no to ${person.display_name}`)
    toast(
      data?.status === 'joined'
        ? `${person.display_name} is in — and joined ${data.group}`
        : data?.status === 'requested'
          ? `${person.display_name} is in — now waiting for ${data.group}’s owner`
          : `${person.display_name} is in Crumbs`,
    )
    onReload?.()
    // Let them know (they may be waiting on the invite page, or have closed it).
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'access_answered',
        userId: person.user_id,
        status: data?.status,
        group: data?.group,
        groupId: data?.group_id,
      }),
    }).catch(() => {})
  }

  if (!asking.length && !(full && keeper)) return null
  return (
    <section className="surface settings-card flex flex-col gap-3">
      <h3 className="font-serif text-2xl font-bold">
        Wants to join Crumbs{asking.length ? ` (${asking.length})` : ''}
      </h3>
      <p className="text-sm text-muted-foreground">
        Everyone new waits for your OK, invite link or not. After you say yes, the group they were
        invited to follows its own rule.
      </p>
      {!asking.length && <p className="text-sm text-muted-foreground">Nobody waiting.</p>}
      {asking.map((r) => (
        <div key={r.user_id} className="surface-soft flex flex-col gap-2">
          <div className="min-w-0">
            <span className="block truncate font-semibold">{r.display_name}</span>
            {r.email && (
              <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
            )}
            <span className="block text-xs text-muted-foreground">
              {timeAgo(r.created_at)}
              {r.group_name
                ? ` · invited to ${r.group_name}${r.role === 'guest' ? ' as a guest' : ''}`
                : ' · no invite'}
            </span>
            {r.note && <p className="mt-1 text-sm">“{r.note}”</p>}
          </div>
          <div className="flex gap-2">
            <button className="secondary !min-h-9 flex-1 !px-3 text-sm" onClick={() => answer(r, false)}>
              No
            </button>
            <button className="primary !min-h-9 flex-1 !px-3 text-sm" onClick={() => answer(r, true)}>
              Let in
            </button>
          </div>
        </div>
      ))}
      {full && saidNo.length > 0 && (
        <>
          <button className="text-left text-sm underline" onClick={() => setShowNo((v) => !v)}>
            {showNo ? 'Hide' : 'Show'} people you said no to ({saidNo.length})
          </button>
          {showNo &&
            saidNo.map((p) => (
              <div key={p.user_id} className="surface-soft flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.display_name}</span>
                  {p.email && (
                    <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                  )}
                </span>
                <button className="secondary !min-h-9 !px-3 text-sm" onClick={() => answer(p, true)}>
                  Let in
                </button>
              </div>
            ))}
        </>
      )}
    </section>
  )
}
