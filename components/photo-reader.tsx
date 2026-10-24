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

/** Camera button: take or pick a photo, get its text back. */
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
        capture="environment"
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
  async function pick(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 600))
        return onDishes(DEMO_AI_MENU)
      }
      const response = await fetch('/api/read-menu-photo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: await toDataUrl(file), placeName }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'AI reading failed')
      track('menu_ai', { dishes: body.dishes?.length ?? 0 })
      if (!body.dishes?.length) toast('No dishes found — try a straighter, closer photo')
      else onDishes(body.dishes)
    } catch (error: any) {
      toast.error(error?.message || 'AI reading failed')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => pick(event.target.files?.[0])}
      />
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Sparkles size={16} />
        {busy ? 'Reading the menu…' : 'Menu photo (AI)'}
      </button>
    </>
  )
}
