'use client'
// U23 (Round 96): what changed on a place and who changed it (the last 30 changes).
import { useEffect, useState } from 'react'
import { Overlay } from './overlay'

type Change = { id: number; user_id: string | null; field: string; old_value: string | null; new_value: string | null; changed_at: string }

const LABEL: Record<string, string> = {
  name: 'name',
  formatted_address: 'address',
  cuisine: 'cuisine',
  price_level: 'price',
  website: 'website',
  status: 'status',
  tags: 'tags',
  heard_from: 'where you heard about it',
  pinned: 'pin',
}

/** "Maya changed cuisine from Thai to Lao" */
export function changeText(c: Pick<Change, 'field' | 'old_value' | 'new_value'>, who: string) {
  const show = (v: string | null) => {
    if (v === null || v === '' || v === '{}') return null
    if (c.field === 'price_level') return '$'.repeat(Number(v) || 0) || null
    if (c.field === 'tags') return v.replace(/^\{|\}$/g, '').replace(/"/g, '').split(',').join(', ')
    return v.length > 60 ? `${v.slice(0, 60)}…` : v
  }
  if (c.field === 'pinned') return `${who} ${c.new_value === 'true' ? 'pinned it' : 'unpinned it'}`
  const label = LABEL[c.field] ?? c.field
  const a = show(c.old_value)
  const b = show(c.new_value)
  if (!b) return `${who} cleared the ${label}`
  if (!a) return `${who} added the ${label}: ${b}`
  return `${who} changed the ${label} from ${a} to ${b}`
}

export function PlaceHistory({
  placeId,
  supabase,
  demo,
  names,
  userId,
}: {
  placeId: string
  supabase: any
  demo: boolean
  names: Record<string, string>
  userId?: string
}) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Change[] | null>(null)
  useEffect(() => {
    if (!open || demo) return
    let live = true
    Promise.resolve(
      supabase.from('place_changes').select('*').eq('place_id', placeId).order('changed_at', { ascending: false }).limit(30),
    )
      .then(({ data, error }: any) => live && setList(error ? [] : (data ?? [])))
      .catch(() => live && setList([]))
    return () => {
      live = false
    }
  }, [open, demo, supabase, placeId])
  const who = (id: string | null) => (id && id === userId ? 'You' : (id && names[id]?.split(' ')[0]) || 'Someone')
  return (
    <>
      <button className="self-center text-xs text-muted-foreground underline" onClick={() => setOpen(true)}>
        History
      </button>
      {open && (
        <Overlay label="History" title="History" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-2">
            {demo && <p className="text-sm text-muted-foreground">Changes show here (needs the real database).</p>}
            {!demo && list === null && <div className="skeleton h-20" />}
            {list?.length === 0 && <p className="text-sm text-muted-foreground">No changes yet.</p>}
            {list?.map((c) => (
              <p key={c.id} className="surface-soft text-sm">
                {changeText(c, who(c.user_id))}
                <span className="block text-xs text-muted-foreground">
                  {new Date(c.changed_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </p>
            ))}
          </div>
        </Overlay>
      )}
    </>
  )
}
