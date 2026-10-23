// Photos for places and dishes. Files live in the public `crumbs-photos` bucket under
// <group id>/<random>.jpg, so the link is unguessable but needs no sign-in to display.
export const PHOTO_BUCKET = 'crumbs-photos'

export function photoUrl(path?: string | null) {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`
}

/** Shrinks a phone photo to at most `max` pixels on the long side (and fixes its rotation). */
export async function shrinkImage(file: File, max = 1280): Promise<Blob> {
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
      0.82,
    ),
  )
}

export async function uploadPhoto(supabase: any, groupId: string, file: File) {
  const blob = await shrinkImage(file)
  const path = `${groupId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return path
}

export async function removePhoto(supabase: any, path?: string | null) {
  if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path])
}
