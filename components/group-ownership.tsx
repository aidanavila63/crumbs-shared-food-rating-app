'use client'
// Third pass #1 and #2 (Round 77): leaving as the owner hands the group over, the owner can hand
// it over or delete it, and anything deleted in the last 30 days can be put back.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Group, Profile } from '@/hooks/use-crumbs-data'
import { askConfirm } from '@/lib/ask'
import { haptic } from '@/lib/motion'
import { timeAgo } from './social'
import { heirs } from '@/lib/heirs'


/** True when the database doesn't know the Round 77 functions yet. */
const notThere = (error: any) => error?.code === 'PGRST202' || /could not find the function/i.test(error?.message ?? '')

export function LeaveGroup({
  group,
  members,
  userId,
  supabase,
  demo,
  onLeft,
}: {
  group: Group
  members: Profile[]
  userId?: string
  supabase: any
  demo: boolean
  onLeft?: (groupId: string) => void
}) {
  const owner = userId === group.created_by
  const others = owner && userId ? heirs(members, userId) : []
  const [mode, setMode] = useState<null | 'handover' | 'leave' | 'delete'>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  async function leave() {
    if (demo) return onLeft?.(group.id)
    setBusy(true)
    let { error } = await supabase.rpc('leave_group', { target_group: group.id })
    if (notThere(error))
      ({ error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', userId))
    setBusy(false)
    if (error) return toast.error(error.message)
    onLeft?.(group.id)
  }

  async function handOver(andLeave: boolean) {
    if (!pick) return
    const name = members.find((m) => m.id === pick)?.display_name ?? 'them'
    if (demo) {
      toast.success(`${group.name} is ${name}’s now`)
      return andLeave ? onLeft?.(group.id) : setMode(null)
    }
    setBusy(true)
    const { error } = await supabase.rpc('transfer_group', { target_group: group.id, new_owner: pick })
    setBusy(false)
    if (error)
      return toast.error(notThere(error) ? 'Run the newest database update first (Admin)' : error.message)
    haptic('success')
    toast.success(`${group.name} is ${name}’s now`)
    if (andLeave) return leave()
    setMode(null)
    window.location.reload()
  }

  async function remove() {
    if (demo) return onLeft?.(group.id)
    setBusy(true)
    const { error } = await supabase.rpc('delete_group', { target_group: group.id, typed_name: typed })
    setBusy(false)
    if (error)
      return toast.error(notThere(error) ? 'Run the newest database update first (Admin)' : error.message)
    haptic('success')
    toast.success(`${group.name} is deleted`)
    onLeft?.(group.id)
  }

  const picker = (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label="Who takes over">
      {others.map((m) => (
        <label key={m.id} className="surface-soft flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="heir"
            checked={pick === m.id}
            onChange={() => setPick(m.id)}
          />
          {m.display_name}
          {m.role === 'admin' && <span className="tag">admin</span>}
        </label>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {owner && (
        <div className="flex gap-2">
          <button
            className="secondary flex-1 !min-h-10 text-sm"
            disabled={!others.length}
            title={others.length ? undefined : 'Nobody else is a full member yet'}
            onClick={() => {
              setPick(others[0]?.id ?? null)
              setMode(mode === 'handover' ? null : 'handover')
            }}
          >
            Hand over
          </button>
          <button
            className="secondary flex-1 !min-h-10 text-sm text-destructive"
            onClick={() => {
              setTyped('')
              setMode(mode === 'delete' ? null : 'delete')
            }}
          >
            Delete group
          </button>
        </div>
      )}
      {mode === 'handover' && (
        <div className="rise-panel surface flex flex-col gap-2">
          <p className="text-sm">
            Who should run <strong>{group.name}</strong>? They get the owner’s settings; you stay
            on as an admin.
          </p>
          {picker}
          <button className="primary" disabled={busy || !pick} onClick={() => handOver(false)}>
            Hand it over
          </button>
        </div>
      )}
      {mode === 'leave' && (
        <div className="rise-panel surface flex flex-col gap-2">
          <p className="text-sm">
            You own <strong>{group.name}</strong>. Who should take over when you leave?
          </p>
          {picker}
          <button className="primary text-destructive" disabled={busy || !pick} onClick={() => handOver(true)}>
            Hand over and leave
          </button>
        </div>
      )}
      {mode === 'delete' && (
        <div className="rise-panel surface flex flex-col gap-2">
          <p className="text-sm">
            This removes <strong>{group.name}</strong> for everyone: its places, ratings, lists,
            plans and photos. It can’t be undone. Type the group’s name to delete it.
          </p>
          <input
            className="field"
            placeholder={group.name}
            aria-label="Group name"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <button
            className="secondary text-destructive"
            disabled={busy || typed.trim().toLowerCase() !== group.name.trim().toLowerCase()}
            onClick={remove}
          >
            Delete {group.name}
          </button>
        </div>
      )}
      <button
        className="secondary text-destructive"
        disabled={busy}
        onClick={async () => {
          if (owner && others.length) {
            setPick(others[0].id)
            return setMode(mode === 'leave' ? null : 'leave')
          }
          if (owner) {
            if (
              await askConfirm('You’re the only full member', {
                body: 'Leaving would leave the group with nobody to run it. Delete it instead?',
                confirm: 'Delete instead',
                danger: true,
              })
            ) {
              setTyped('')
              setMode('delete')
            }
            return
          }
          if (
            await askConfirm(`Leave ${group.name}?`, {
              body: 'You can rejoin with the code.',
              confirm: 'Leave',
              danger: true,
            })
          )
            leave()
        }}
      >
        Leave group
      </button>
    </div>
  )
}

type Deleted = {
  id: string
  kind: 'place' | 'list'
  name: string
  deleted_at: string
  deleted_by: string | null
  until: string
  ratings: number
  places: number
}

/** Third pass #2: places and lists deleted in the last 30 days, ready to put back. */
export function RecentlyDeleted({
  group,
  supabase,
  demo,
  canEmpty,
  canRestore,
  names,
  onRestored,
}: {
  group: Group
  supabase: any
  demo: boolean
  canEmpty: boolean
  canRestore: boolean
  names: Record<string, string>
  onRestored: () => void
}) {
  const [items, setItems] = useState<Deleted[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (demo) return
    const { data, error } = await supabase.rpc('recently_deleted', { target_group: group.id })
    if (!error) setItems(data ?? [])
  }, [demo, group.id, supabase])
  useEffect(() => {
    load()
  }, [load])
  if (!items.length) return null

  async function restore(item: Deleted) {
    setBusy(item.id)
    const { data, error } = await supabase.rpc('restore_deleted', { item: item.id })
    setBusy(null)
    if (error) return toast.error(error.message)
    haptic('success')
    toast.success(
      `${item.name} is back${data?.skipped ? ` (${data.skipped} part${data.skipped === 1 ? '' : 's'} couldn’t come back)` : ''}`,
    )
    setItems((current) => current.filter((x) => x.id !== item.id))
    onRestored()
  }

  async function empty() {
    if (
      !(await askConfirm('Empty Recently deleted?', {
        body: 'These can’t be put back afterwards.',
        confirm: 'Empty',
        danger: true,
      }))
    )
      return
    const { error } = await supabase.rpc('purge_deleted', { target_group: group.id })
    if (error) return toast.error(error.message)
    setItems([])
  }

  return (
    <div className="surface">
      <button
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <h2 className="font-serif text-2xl font-bold">Recently deleted</h2>
        <span className="text-sm text-muted-foreground">
          {items.length} {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="rise-panel mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Kept for 30 days with everyone’s ratings, visits and photos, then gone for good.
          </p>
          {items.map((item) => (
            <div key={item.id} className="surface-soft flex items-center justify-between gap-2">
              <span className="min-w-0 text-sm">
                <strong className="block truncate">
                  {item.kind === 'list' ? '📋 ' : ''}
                  {item.name || 'Untitled'}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(item.deleted_at)}
                  {item.deleted_by && names[item.deleted_by] ? ` by ${names[item.deleted_by]}` : ''}
                  {item.kind === 'place' && item.ratings
                    ? ` · ${item.ratings} rating${item.ratings === 1 ? '' : 's'}`
                    : ''}
                  {item.kind === 'list' ? ` · ${item.places} place${item.places === 1 ? '' : 's'}` : ''}
                </span>
              </span>
              {canRestore && (
                <button
                  className="secondary !min-h-10 shrink-0 !px-3 text-sm"
                  disabled={busy === item.id}
                  onClick={() => restore(item)}
                >
                  {busy === item.id ? 'Putting back…' : 'Put back'}
                </button>
              )}
            </div>
          ))}
          {canEmpty && (
            <button className="self-start text-xs text-destructive underline" onClick={empty}>
              Empty now
            </button>
          )}
        </div>
      )}
    </div>
  )
}
