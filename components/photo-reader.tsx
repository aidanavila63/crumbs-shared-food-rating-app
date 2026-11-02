'use client'
// Reads text from a photo on the phone (tesseract.js, free; nothing is uploaded).
// The reading engine (~5 MB) downloads the first time it's used, then the browser caches it.
import { track } from '@/lib/analytics'
import { useRef, useState } from 'react'
import { Camera, Sparkles } from 'lucide-react'
import type { MenuLine } from '@/lib/ocr-parse'
import { toast } from 'sonner'

async function shrink(file: File, max = 1800): Promise<Blob | File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    if (scale === 1) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.9),
    )
  } catch {
    return file
  }
}

export async function readPhotoText(file: File, onProgress?: (pct: number) => void) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m: any) =>
      m.status === 'recognizing text' && onProgress?.(Math.round(m.progress * 100)),
  })
  try {
    const { data } = await worker.recognize(await shrink(file))
    return data.text as string
  } finally {
    await worker.terminate()
  }
}

/** Photo button: take a photo or pick one from the camera roll, get its text back. */
export function ReadPhotoButton({
  label,
  className = 'secondary !min-h-10 !px-3 text-sm',
  onText,
}: {
  label: string
  className?: string
  onText: (text: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  async function pick(file?: File) {
    if (!file) return
    setProgress(0)
    try {
      const text = await readPhotoText(file, setProgress)
      track('photo_read', { what: label, chars: text.length })
      if (!text.trim()) toast('Couldn’t read any text — try a sharper, closer photo')
      else onText(text)
    } catch (error: any) {
      toast.error(error?.message || 'Couldn’t read that photo')
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => pick(event.target.files?.[0])}
      />
      <button
        type="button"
        className={className}
        disabled={progress !== null}
        onClick={() => input.current?.click()}
      >
        <Camera size={16} />
        {progress === null ? label : `Reading… ${progress}%`}
      </button>
    </>
  )
}

async function toDataUrl(file: File, max = 1600) {
  const blob = await shrink(file, max)
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Couldn’t open that photo'))
    reader.readAsDataURL(blob)
  })
}

const DEMO_AI_MENU: MenuLine[] = [
  { name: 'Shoyu Ramen', price: 15.5, description: 'Soy broth, bamboo, nori', course: 'main' },
  { name: 'Black Garlic Tonkotsu', price: 18, description: null, course: 'main' },
  { name: 'Chicken Karaage', price: 11, description: 'Yuzu mayo', course: 'starter' },
  { name: 'Yuzu Sorbet', price: 6.5, description: null, course: 'dessert' },
]

/**
 * #19 AI menu reading (admin switch "menu_ai"): the photo goes to the AI once and comes back as
 * dishes with prices and courses — far better than on-phone reading for real menus.
 */
export function AiMenuPhotoButton({
  placeName,
  demo,
  onDishes,
  className = 'secondary !min-h-10 !px-3 text-sm',
}: {
  placeName: string
  demo: boolean
  onDishes: (dishes: MenuLine[]) => void
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<[number, number] | null>(null)
  // Menus are often several pages: pick up to 4 photos at once and they're read one by one.
  async function pick(list?: FileList | null) {
    const files = Array.from(list ?? []).slice(0, 4)
    if (!files.length) return
    if ((list?.length ?? 0) > 4) toast('Reading the first 4 photos')
    setBusy(true)
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 600))
        return onDishes(DEMO_AI_MENU)
      }
      const all: MenuLine[] = []
      let failed = 0
      for (const [i, file] of files.entries()) {
        setPage(files.length > 1 ? [i + 1, files.length] : null)
        try {
          const response = await fetch('/api/read-menu-photo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ image: await toDataUrl(file), placeName }),
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(body.error || 'AI reading failed')
          for (const dish of (body.dishes ?? []) as MenuLine[])
            if (!all.some((d) => d.name.toLowerCase() === dish.name.toLowerCase())) all.push(dish)
        } catch (error) {
          // One bad page shouldn't lose the others (unless it's the only one).
          if (files.length === 1) throw error
          failed++
        }
      }
      track('menu_ai', { dishes: all.length, photos: files.length })
      if (failed) toast(`Couldn’t read ${failed} of the photos`)
      if (!all.length) toast('No dishes found — try a straighter, closer photo')
      else onDishes(all)
    } catch (error: any) {
      toast.error(error?.message || 'AI reading failed')
    } finally {
      setBusy(false)
      setPage(null)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => pick(event.target.files)}
      />
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Sparkles size={16} />
        {busy
          ? page
            ? `Reading page ${page[0]} of ${page[1]}…`
            : 'Reading the menu…'
          : 'Menu photos (AI)'}
      </button>
    </>
  )
}
