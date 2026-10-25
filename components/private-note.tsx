'use client'
// #10 Private notes: a note on a place that only you can ever see — not your group, not admins
// (row-level security: your own rows only). Saved when you leave the box; empty deletes it.
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'

export function PrivateNote({
  placeId,
  userId,
  supabase,
  demo,
}: {
  placeId: string
  userId: string
  supabase: any
  demo: boolean
}) {
  const [saved, setSaved] = useState('')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (demo) return
    let cancelled = false
    supabase
      .from('place_private_notes')
      .select('body')
      .eq('place_id', placeId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (cancelled || !data?.body) return
        setSaved(data.body)
        setText(data.body)
        setOpen(true)
      })
    return () => {
      cancelled = true
    }
  }, [demo, placeId, supabase, userId])

  async function save() {
    const body = text.trim()
    if (body === saved) return
    setSaved(body)
    if (demo) return
    const { error } = body
      ? await supabase
          .from('place_private_notes')
          .upsert({
            place_id: placeId,
            user_id: userId,
            body,
            updated_at: new Date().toISOString(),
          })
      : await supabase
          .from('place_private_notes')
          .delete()
          .match({ place_id: placeId, user_id: userId })
    if (error) toast.error(error.message)
  }

  if (!open)
    return (
      <button
        className="flex items-center gap-1 self-start text-xs font-semibold text-muted-foreground underline"
        onClick={() => setOpen(true)}
      >
        <Lock size={12} /> Add a private note (only you see it)
      </button>
    )
  return (
    <label className="private-note flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <Lock size={12} /> Private note — only you can see this
      </span>
      <textarea
        className="field min-h-16 text-base"
        maxLength={4000}
        placeholder="Who you went with, what to order next time, the server’s name…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
      />
    </label>
  )
}
