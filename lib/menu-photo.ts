// #19 AI menu reading: what may be sent to the AI.
/** "data:image/jpeg;base64,...." → { base64, mediaType } (images only, ≤ ~2 MB). */
export function parseImage(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') return null
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m || m[2].length > 2_800_000) return null
  return { mediaType: m[1], base64: m[2] }
}
