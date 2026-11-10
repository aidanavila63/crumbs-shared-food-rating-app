// Photos for places, dishes and group covers. Files live in the public `crumbs-photos` bucket
// under <group id>/<random>.jpg, so the link is unguessable but needs no sign-in to display.
// #80 When NEXT_PUBLIC_R2_PUBLIC_URL is set, NEW photos go to Cloudflare R2 instead (10 GB free,
// no download fees) and are saved as "r2/<group id>/<random>.jpg"; older photos keep working.
export const PHOTO_BUCKET = 'crumbs-photos'
const R2_PREFIX = 'r2/'

export const usesR2 = (path?: string | null) => !!path && path.startsWith(R2_PREFIX)

export function photoUrl(path?: string | null, r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL) {
  if (!path) return null
  if (usesR2(path))
    return r2Base ? `${r2Base.replace(/\/$/, '')}/${path.slice(R2_PREFIX.length)}` : null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`
}

/** Part three: small copy for lists and grids (Supabase storage only — R2 has no download fees).
 * "<group>/<uuid>.jpg" → "<group>/<uuid>.t.jpg"; anything else → null. */
export function thumbPath(path?: string | null) {
  if (!path || usesR2(path)) return null
  const m = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.jpg$/.exec(path)
  return m ? `${m[1]}/${m[2]}.t.jpg` : null
}

export const THUMB_SIZE = 400

/** "r2/<group>/<uuid>.jpg" → its key in the R2 bucket and the group it belongs to (or null). */
export function r2Key(path: string) {
  const m = /^r2\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.jpg$/.exec(path)
  return m ? { key: `${m[1]}/${m[2]}.jpg`, groupId: m[1] } : null
}

/** Shrinks a phone photo to at most `max` pixels on the long side (and fixes its rotation). */
export async function shrinkImage(file: File | Blob, max = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read that photo'))),
      'image/jpeg',
      quality,
    ),
  )
}

async function photoApi(body: Record<string, unknown>) {
  const response = await fetch('/api/photos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Photo storage unavailable')
  return data
}

export async function uploadPhoto(supabase: any, groupId: string, file: File | Blob) {
  const blob = await shrinkImage(file)
  if (process.env.NEXT_PUBLIC_R2_PUBLIC_URL) {
    const { url, path } = await photoApi({ op: 'upload', groupId })
    const put = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { 'content-type': 'image/jpeg' },
    })
    if (!put.ok) throw new Error('Could not upload that photo')
    return path as string
  }
  const path = `${groupId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  // The small copy is a bonus: if it fails, lists just use the full photo.
  const small = thumbPath(path)
  if (small) {
    try {
      const thumb = await shrinkImage(blob, THUMB_SIZE, 0.72)
      await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(small, thumb, { contentType: 'image/jpeg', cacheControl: '31536000' })
    } catch {}
  }
  return path
}

export async function removePhoto(supabase: any, path?: string | null) {
  if (!path) return
  if (usesR2(path)) await photoApi({ op: 'delete', path }).catch(() => {})
  else {
    const small = thumbPath(path)
    await supabase.storage.from(PHOTO_BUCKET).remove(small ? [path, small] : [path])
  }
}
