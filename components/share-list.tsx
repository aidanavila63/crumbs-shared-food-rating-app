'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/** Private read-only link to one list. Shows names, addresses, cuisine, price and average stars only. */
export function ShareList({
  listId,
  userId,
  supabase,
  demo,
}: {
  listId: string
  userId?: string
  supabase: any
  demo: boolean
}) {
  const [token, setToken] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(demo)
  const [busy, setBusy] = useState(false)
  const url = token ? `${location.origin}/share/${token}` : null

  useEffect(() => {
    if (demo) return
    let cancelled = false
    supabase
      .from('list_shares')
      .select('token')
      .eq('list_id', listId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (cancelled) return
        setToken(data?.token ?? null)
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [demo, listId, supabase])

  async function copy(link: string) {
    try {
      if (navigator.share) await navigator.share({ title: 'Our Crumbs list', url: link })
      else {
        await navigator.clipboard.writeText(link)
        toast.success('Link copied')
      }
    } catch {
      // share sheet dismissed
    }
  }

  async function create() {
    if (demo) return toast('Sharing needs the real database, not demo mode')
    setBusy(true)
    const { data, error } = await supabase
      .from('list_shares')
      .insert({ list_id: listId, created_by: userId })
      .select('token')
      .single()
    setBusy(false)
    if (error) return toast.error(error.message)
    setToken(data.token)
    copy(`${location.origin}/share/${data.token}`)
  }

  async function stop() {
    setBusy(true)
    const { error } = await supabase.from('list_shares').delete().eq('list_id', listId)
    setBusy(false)
    if (error) return toast.error(error.message)
    setToken(null)
    toast.success('Link switched off. It no longer works.')
  }

  if (!loaded) return null
  return (
    <div className="surface-soft mt-5 flex flex-col gap-2 text-sm">
      <p className="font-semibold">Share this list</p>
      {url ? (
        <>
          <p className="break-all text-xs text-muted-foreground">{url}</p>
          <div className="flex gap-4">
            <button className="text-primary" disabled={busy} onClick={() => copy(url)}>
              Copy / send link
            </button>
            <button className="text-destructive" disabled={busy} onClick={stop}>
              Stop sharing
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Anyone with the link can see place names, addresses and average ratings. Your notes,
            dishes, photos and who rated what stay private. You can switch it off any time.
          </p>
          <button className="primary w-fit !min-h-10 !px-4" disabled={busy} onClick={create}>
            Create private link
          </button>
        </>
      )}
    </div>
  )
}
