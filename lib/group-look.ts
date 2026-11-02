// A group's emoji is a single emoji; older groups may have typed two, so show just the first.
export function oneEmoji(text?: string | null) {
  if (!text) return null
  const Seg = (Intl as any).Segmenter
  if (Seg) {
    for (const { segment } of new Seg(undefined, { granularity: 'grapheme' }).segment(text.trim()))
      return segment as string
  }
  return Array.from(text.trim())[0] ?? null
}
