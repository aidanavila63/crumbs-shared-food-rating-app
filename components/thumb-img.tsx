'use client'

// Part three: lists and grids load the small copy of a photo (~30 KB instead of ~200 KB).
// Photos from before small copies existed don't have one: the first miss falls back to the full
// photo and is remembered for the rest of the visit, so it isn't tried again.
import { useState } from 'react'
import { photoUrl, thumbPath } from '@/lib/photos'

const missing = new Set<string>()

export function thumbSrc(path?: string | null) {
  const small = thumbPath(path)
  if (small && !missing.has(small)) return photoUrl(small)
  return photoUrl(path)
}

export function ThumbImg({
  path,
  alt,
  className,
}: {
  path: string | null | undefined
  alt: string
  className?: string
}) {
  const [, redo] = useState(0)
  const src = thumbSrc(path)
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        const small = thumbPath(path)
        if (small && !missing.has(small)) {
          missing.add(small)
          redo((n) => n + 1)
        }
      }}
    />
  )
}
