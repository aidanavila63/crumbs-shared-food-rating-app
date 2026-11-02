'use client'
// Crop a photo before it's saved: drag to move, pinch or use the slider to zoom. A faint outline
// shows exactly what will be visible (the rest is dimmed). The result is a small JPEG, which also
// keeps photo storage low.
import { useEffect, useRef, useState } from 'react'
import { Overlay } from './overlay'

type View = { x: number; y: number; zoom: number }

export function PhotoCropper({
  file,
  aspect = 4 / 3,
  round = false,
  outWidth = 1280,
  title = 'Fit your photo',
  onDone,
  onCancel,
}: {
  file: File | Blob
  /** width ÷ height of the visible area */
  aspect?: number
  /** a circle outline (profile photos) */
  round?: boolean
  outWidth?: number
  title?: string
  onDone: (blob: Blob) => void
  onCancel: () => void
}) {
  const [img, setImg] = useState<ImageBitmap | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [busy, setBusy] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState({ w: 300, h: 225 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    const u = URL.createObjectURL(file)
    setUrl(u)
    createImageBitmap(file, { imageOrientation: 'from-image' })
      .then((bitmap) => !cancelled && setImg(bitmap))
      .catch(() => onCancel())
    return () => {
      cancelled = true
      URL.revokeObjectURL(u)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // The frame fills the width of the screen (minus a margin) at the right shape.
  useEffect(() => {
    const measure = () => {
      const box = stage.current?.getBoundingClientRect()
      if (!box) return
      let w = box.width - 32
      let h = w / aspect
      if (h > box.height - 32) {
        h = box.height - 32
        w = h * aspect
      }
      setFrame({ w, h })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [aspect])

  // At zoom 1 the photo just covers the frame.
  const base = img ? Math.max(frame.w / img.width, frame.h / img.height) : 1
  const scale = base * view.zoom
  const shownW = img ? img.width * scale : 0
  const shownH = img ? img.height * scale : 0
  const clamp = (v: View): View => {
    const maxX = Math.max(0, (shownWFor(v.zoom) - frame.w) / 2)
    const maxY = Math.max(0, (shownHFor(v.zoom) - frame.h) / 2)
    return {
      zoom: v.zoom,
      x: Math.min(maxX, Math.max(-maxX, v.x)),
      y: Math.min(maxY, Math.max(-maxY, v.y)),
    }
  }
  function shownWFor(zoom: number) {
    return img ? img.width * base * zoom : 0
  }
  function shownHFor(zoom: number) {
    return img ? img.height * base * zoom : 0
  }

  function onDown(event: React.PointerEvent) {
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom }
    }
  }
  function onMove(event: React.PointerEvent) {
    const last = pointers.current.get(event.pointerId)
    if (!last) return
    const now = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, now)
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const zoom = Math.min(
        5,
        Math.max(1, (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist),
      )
      setView((v) => clamp({ ...v, zoom }))
      return
    }
    setView((v) => clamp({ ...v, x: v.x + now.x - last.x, y: v.y + now.y - last.y }))
  }
  function onUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  async function save() {
    if (!img) return
    setBusy(true)
    // What's inside the frame, in the photo's own pixels.
    const sw = frame.w / scale
    const sh = frame.h / scale
    const sx = img.width / 2 - (frame.w / 2 + view.x) / scale
    const sy = img.height / 2 - (frame.h / 2 + view.y) / scale
    const w = Math.round(Math.min(outWidth, sw))
    const h = Math.round(w / aspect)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
    canvas.toBlob(
      (blob) => {
        setBusy(false)
        if (blob) onDone(blob)
      },
      'image/jpeg',
      0.84,
    )
  }

  return (
    <Overlay label={title} title={title} onClose={onCancel}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Drag to move · pinch or slide to zoom. Only what’s inside the outline shows.
        </p>
        <div
          ref={stage}
          className="cropper-stage"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {url && img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              draggable={false}
              className="cropper-img"
              style={{
                width: shownW,
                height: shownH,
                transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
              }}
            />
          )}
          <div
            className={`cropper-frame ${round ? 'cropper-round' : ''}`}
            style={{ width: frame.w, height: frame.h }}
            aria-hidden="true"
          />
        </div>
        <input
          type="range"
          className="points-slider"
          aria-label="Zoom"
          min={1}
          max={5}
          step={0.01}
          value={view.zoom}
          onChange={(event) => setView((v) => clamp({ ...v, zoom: Number(event.target.value) }))}
        />
        <div className="flex gap-2">
          <button className="secondary flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary flex-1" disabled={!img || busy} onClick={save}>
            {busy ? 'Saving…' : 'Use this'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
