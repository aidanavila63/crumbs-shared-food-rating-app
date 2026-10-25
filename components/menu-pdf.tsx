'use client'
// #214 Menu PDFs: owners upload their menu as a PDF (members can open it); the AI reads queued PDFs
// into the shared menu at the end of the month with whatever AI allowance is left over.
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Trash2 } from 'lucide-react'
import { haptic } from '@/lib/motion'
import { timeAgo } from './social'

type MenuFile = {
  id: string
  path: string
  created_at: string
  status: 'queued' | 'reading' | 'read' | 'failed'
  dishes_added: number | null
}
export const menuPdfUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/crumbs-menus/${path}`

function useMenuFiles(restaurantId: string, supabase: any, demo: boolean) {
  const [files, setFiles] = useState<MenuFile[]>([])
  useEffect(() => {
    if (demo) return
    let cancelled = false
    supabase
      .from('restaurant_menu_files')
      .select('id,path,created_at,status,dishes_added')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }: any) => !cancelled && setFiles(data ?? []))
    return () => {
      cancelled = true
    }
  }, [demo, restaurantId, supabase])
  return [files, setFiles] as const
}

/** For members: open the restaurant's latest menu PDF. */
export function MenuPdfLink({
  restaurantId,
  supabase,
  demo,
}: {
  restaurantId: string
  supabase: any
  demo: boolean
}) {
  const [files] = useMenuFiles(restaurantId, supabase, demo)
  const latest = files[0]
  if (!latest) return null
  return (
    <a
      className="flex items-center gap-1 self-start text-sm font-semibold text-primary underline"
      href={menuPdfUrl(latest.path)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <FileText size={14} /> The restaurant’s menu (PDF)
    </a>
  )
}

/** For owners: upload and manage menu PDFs. */
export function OwnerMenuPdf({
  restaurantId,
  supabase,
  demo,
}: {
  restaurantId: string
  supabase: any
  demo: boolean
}) {
  const [files, setFiles] = useMenuFiles(restaurantId, supabase, demo)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function upload(file?: File) {
    if (!file) return
    if (file.type !== 'application/pdf') return toast.error('That isn’t a PDF')
    if (file.size > 8 * 1024 * 1024) return toast.error('PDFs up to 8 MB, please')
    if (demo) return toast('Uploads need the real database, not demo mode')
    setBusy(true)
    try {
      const path = `${restaurantId}/${crypto.randomUUID()}.pdf`
      const { error } = await supabase.storage
        .from('crumbs-menus')
        .upload(path, file, { contentType: 'application/pdf', cacheControl: '86400' })
      if (error) throw error
      const { data, error: rowError } = await supabase
        .from('restaurant_menu_files')
        .insert({ restaurant_id: restaurantId, path, bytes: file.size })
        .select('id,path,created_at,status,dishes_added')
        .single()
      if (rowError) throw rowError
      setFiles((all) => [data, ...all])
      haptic('success')
      toast.success('Uploaded — members can open it now, and it’s queued to fill your menu')
    } catch (error: any) {
      toast.error(error?.message || 'Could not upload that')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  async function remove(f: MenuFile) {
    if (!window.confirm('Delete this PDF? Dishes already added stay on your menu.')) return
    setFiles((all) => all.filter((x) => x.id !== f.id))
    if (demo) return
    await supabase.storage.from('crumbs-menus').remove([f.path])
    await supabase.from('restaurant_menu_files').delete().eq('id', f.id)
  }

  return (
    <section className="surface flex flex-col gap-2">
      <h3 className="font-serif text-xl font-bold">Menu PDF</h3>
      <p className="text-sm text-muted-foreground">
        Upload your menu as a PDF. Members can open it straight away, and Crumbs reads it into your
        menu for you (no typing) — PDFs are read in the order they were uploaded, near the end of
        each month.
      </p>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => upload(event.target.files?.[0])}
      />
      <button className="secondary" disabled={busy} onClick={() => input.current?.click()}>
        <FileText size={16} /> {busy ? 'Uploading…' : 'Upload menu PDF'}
      </button>
      {files.map((f) => (
        <div key={f.id} className="surface-soft flex items-center justify-between gap-2 text-sm">
          <a
            className="min-w-0 underline"
            href={menuPdfUrl(f.path)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Menu · {timeAgo(f.created_at)}
          </a>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {f.status === 'read'
              ? `✓ read · ${f.dishes_added ?? 0} new dishes`
              : f.status === 'failed'
                ? 'couldn’t read it'
                : 'waiting in the queue'}
            <button aria-label="Delete PDF" className="icon-btn" onClick={() => remove(f)}>
              <Trash2 size={14} />
            </button>
          </span>
        </div>
      ))}
    </section>
  )
}
