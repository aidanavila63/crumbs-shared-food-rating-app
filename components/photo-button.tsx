'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { photoUrl, removePhoto, uploadPhoto } from '@/lib/photos'
import { PhotoCropper } from './photo-cropper'

/** One photo: add, replace, remove. The caller saves the returned path on its own row. */
export function PhotoButton({
  path,
  groupId,
  supabase,
  demo,
  label,
  compact,
  aspect = 2,
  onChange,
}: {
  /** shape of where the photo is shown (width ÷ height); you crop to it before it's saved */
  aspect?: number
  path?: string | null
  groupId: string
  supabase: any
  demo: boolean
  label: string
  compact?: boolean
  onChange: (path: string | null) => Promise<boolean> | boolean | void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [cropping, setCropping] = useState<File | null>(null)
  const url = photoUrl(path)

  async function pick(file?: File | Blob) {
    if (!file) return
    if (demo) return toast('Photos need the real database, not demo mode')
    setBusy(true)
    try {
      const next = await uploadPhoto(supabase, groupId, file)
      const saved = await onChange(next)
      if (saved === false) return removePhoto(supabase, next)
      await removePhoto(supabase, path)
    } catch (error: any) {
      toast.error(error?.message || 'Could not upload that photo')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function clear() {
    setBusy(true)
    try {
      const saved = await onChange(null)
      if (saved !== false) await removePhoto(supabase, path)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={`${label} photo`}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) setCropping(file)
          if (input.current) input.current.value = ''
        }}
      />
      {cropping && (
        <PhotoCropper
          file={cropping}
          aspect={aspect}
          onCancel={() => setCropping(null)}
          onDone={(blob) => {
            setCropping(null)
            pick(blob)
          }}
        />
      )}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${label} photo`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            loading="lazy"
            className={`${compact ? 'h-12 w-12' : 'w-full'} rounded-2xl object-cover`}
            style={compact ? undefined : { aspectRatio: aspect }}
          />
        </a>
      )}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <button
          type="button"
          className="underline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Uploading…' : url ? 'Replace photo' : '📷 Add photo'}
        </button>
        {url && !busy && (
          <button type="button" className="underline" onClick={clear}>
            Remove photo
          </button>
        )}
      </div>
    </div>
  )
}
