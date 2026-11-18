'use client'
// U8 (Round 93): up to 3 photos on a visit — the food, the table, the people. Filed under the
// group (B12), counted as in use by Admin → Photos. Tap one to see it big.
import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { toast } from 'sonner'
import type { PlaceVisit } from '@/hooks/use-crumbs-data'
import { photoUrl, removePhoto, uploadPhoto } from '@/lib/photos'
import { haptic } from '@/lib/motion'
import { ThumbImg } from './thumb-img'
import { Overlay } from './overlay'

export const MAX_VISIT_PHOTOS = 3

export function VisitPhotos({
  visit,
  groupId,
  supabase,
  demo,
  canEdit,
  onChange,
}: {
  visit: PlaceVisit
  groupId: string
  supabase: any
  demo: boolean
  canEdit: boolean
  onChange: (paths: string[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const paths = visit.photo_paths ?? []

  async function save(next: string[]) {
    if (demo) {
      onChange(next)
      return true
    }
    const { error } = await supabase.from('place_visits').update({ photo_paths: next }).eq('id', visit.id)
    if (error) {
      toast.error(/photo_paths|schema cache/i.test(error.message ?? '') ? 'Visit photos aren’t switched on yet' : error.message)
      return false
    }
    onChange(next)
    return true
  }

  async function add(files: FileList | null) {
    const picked = [...(files ?? [])].slice(0, MAX_VISIT_PHOTOS - paths.length)
    if (!picked.length) return
    if (demo) return toast('Photos need the real database, not demo mode')
    setBusy(true)
    try {
      const added: string[] = []
      for (const file of picked) added.push(await uploadPhoto(supabase, groupId, file))
      if (!(await save([...paths, ...added]))) await Promise.all(added.map((p) => removePhoto(supabase, p)))
      else haptic('success')
    } catch (error: any) {
      toast.error(error?.message || 'Could not upload that photo')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function remove(path: string) {
    setOpen(null)
    if (await save(paths.filter((p) => p !== path))) await removePhoto(supabase, path)
  }

  if (!paths.length && !canEdit) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {paths.map((path) => (
        <button
          key={path}
          className="overflow-hidden rounded-xl"
          aria-label="See this photo"
          onClick={() => setOpen(path)}
        >
          <ThumbImg path={path} alt="Visit photo" className="size-14 object-cover" />
        </button>
      ))}
      {canEdit && paths.length < MAX_VISIT_PHOTOS && (
        <>
          <button
            className="chip chip-sm"
            disabled={busy}
            onClick={() => input.current?.click()}
            aria-label="Add a photo to this visit"
          >
            <Camera size={14} /> {busy ? 'Adding…' : paths.length ? 'Add' : 'Add photos'}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => add(event.target.files)}
          />
        </>
      )}
      {open && (
        <Overlay label="Visit photo" title="Visit photo" onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(open) ?? ''} alt="Visit photo" className="w-full rounded-2xl" />
            {canEdit && (
              <button className="secondary text-destructive" onClick={() => remove(open)}>
                <X size={16} /> Remove this photo
              </button>
            )}
          </div>
        </Overlay>
      )}
    </div>
  )
}
