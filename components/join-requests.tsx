'use client'
// People asking to join a public group: the owner or an admin says yes or no.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Group } from '@/hooks/use-crumbs-data'
import { haptic } from '@/lib/motion'
import { timeAgo } from './social'

type Request = { user_id: string; display_name: string; created_at: string }

export function JoinRequestsCard({
  group,
  supabase,
  demo,
  onReload,
}: {
  group: Group
  supabase: any
  demo: boolean
  onReload: () => void
}) {
  const [requests, setRequests] = useState<Request[]>([])
  const load = useCallback(async () => {
    if (demo || group.visibility !== 'public') return setRequests([])
    const { data } = await supabase.rpc('join_requests', { target: group.id })
    setRequests(data ?? [])
  }, [demo, group.id, group.visibility, supabase])
  useEffect(() => {
    load()
  }, [load])

  async function answer(r: Request, accept: boolean) {
    const { error } = await supabase.rpc('answer_join_request', {
      target: group.id,
      person: r.user_id,
      accept,
    })
    if (error) return toast.error(error.message)
    haptic(accept ? 'success' : 'tap')
    toast(accept ? `${r.display_name} joined` : 'Request declined')
    setRequests((all) => all.filter((x) => x.user_id !== r.user_id))
    if (accept) onReload()
  }

  if (!requests.length) return null
  return (
    <div className="surface flex flex-col gap-3">
      <h3 className="font-serif text-2xl font-bold">Asking to join ({requests.length})</h3>
      {requests.map((r) => (
        <div key={r.user_id} className="surface-soft flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{r.display_name}</span>
            <span className="block text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
          </span>
          <button className="secondary !min-h-9 !px-3 text-sm" onClick={() => answer(r, false)}>
            No
          </button>
          <button className="primary !min-h-9 !px-3 text-sm" onClick={() => answer(r, true)}>
            Let in
          </button>
        </div>
      ))}
    </div>
  )
}
