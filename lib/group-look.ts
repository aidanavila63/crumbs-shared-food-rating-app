import { crumbsBadge } from './group-badges.ts'

// A group's emoji is a single emoji; older groups may have typed two, so show just the first.
// One of Crumbs' own badges ("crumbs:loaf") gives its stand-in emoji where only text fits.
/** Round 91 (Aidan): when groups are listed, Crumbs' own drawn badges aren't shown — only on the
 *  group's own page. Keyboard emoji still show. */
export function listEmoji(text?: string | null) {
  if (!text || text.startsWith('crumbs:')) return null
  return oneEmoji(text)
}

export function oneEmoji(text?: string | null) {
  if (!text) return null
  const badge = crumbsBadge(text)
  if (badge) return badge.stand_in
  if (text.startsWith('crumbs:')) return null
  const Seg = (Intl as any).Segmenter
  if (Seg) {
    for (const { segment } of new Seg(undefined, { granularity: 'grapheme' }).segment(text.trim()))
      return segment as string
  }
  return Array.from(text.trim())[0] ?? null
}

function graphemes(text: string): string[] {
  const Seg = (Intl as any).Segmenter
  if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s: any) => s.segment as string)
  return Array.from(text)
}

/**
 * Round 83: any one emoji typed from the phone's keyboard (flags, skin tones and families
 * included), or null when the text is empty, more than one emoji, or not an emoji at all.
 */
export function singleEmoji(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  if (!t) return null
  const parts = graphemes(t)
  if (parts.length !== 1) return null
  const one = parts[0]
  if (one.length > 32) return null
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(one) ? one : null
}

/** The emoji picker's sets (any other emoji can be typed from the keyboard). */
export const EMOJI_SETS: { label: string; emoji: string[] }[] = [
  {
    label: 'Food',
    emoji: [
      '🍜', '🍣', '🍕', '🌮', '🍔', '🥟', '🍝', '🥗', '🍱', '🥙', '🍛', '🍲', '🥘', '🍤', '🍗', '🥩',
      '🌯', '🥪', '🍳', '🥞', '🧇', '🥐', '🥯', '🍞', '🥨', '🧀', '🍟', '🌭', '🍖', '🥓', '🫔', '🫕',
      '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🦪', '🦞', '🦀', '🐟', '🥫', '🧆', '🥚', '🍿',
    ],
  },
  {
    label: 'Sweets & fruit',
    emoji: [
      '🍩', '🍰', '🧁', '🎂', '🍦', '🍨', '🍧', '🍪', '🍫', '🍬', '🍭', '🍮', '🥧', '🍯', '🍓', '🍑',
      '🍒', '🍇', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍐', '🥝', '🫐', '🥥', '🥑', '🌶️', '🧄',
      '🥕', '🌽', '🥦', '🍄', '🥜', '🫘',
    ],
  },
  {
    label: 'Drinks',
    emoji: ['☕', '🍵', '🧋', '🧃', '🥤', '🥛', '🍷', '🍺', '🍻', '🥂', '🍾', '🍹', '🍸', '🥃', '🧉', '🍶'],
  },
  {
    label: 'Places & travel',
    emoji: [
      '🍽️', '🥢', '🏠', '🏡', '🏙️', '🌆', '🗺️', '✈️', '🚗', '🚲', '🚆', '⛺', '🏖️', '🏝️', '🏔️', '🌴',
      '🌍', '🗽', '🎡', '⛩️', '🕌', '🏰', '🌉', '🌃',
    ],
  },
  {
    label: 'Animals',
    emoji: [
      '🐻', '🐱', '🐶', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🐦', '🦉', '🐝', '🦋', '🐢',
      '🐙', '🦄', '🐷', '🐮', '🐰', '🦔', '🦦', '🐳',
    ],
  },
  {
    label: 'Faces & people',
    emoji: [
      '😋', '🤤', '😍', '🥰', '😎', '🤓', '🥳', '🤠', '😇', '🤗', '🫶', '👯', '👨‍🍳', '👩‍🍳', '🧑‍🍳', '👪',
      '💑', '👭', '👬', '🙌', '👏', '🤝', '✌️', '🤙',
    ],
  },
  {
    label: 'Fun & symbols',
    emoji: [
      '❤️', '💕', '💛', '💚', '💙', '💜', '🖤', '🤍', '⭐', '✨', '🌟', '🔥', '🎉', '🎊', '🎈', '🎁',
      '🏆', '🥇', '🎯', '🎲', '🎮', '🎸', '🎵', '📸', '📚', '⚽', '🏀', '🏈', '⚾', '🎾', '🏒', '⛳',
      '🌈', '☀️', '🌙', '❄️', '🌸', '🌻', '🍀', '🌿', '💎', '👑', '🍁', '🎃',
    ],
  },
]
