// Round 83: Crumbs' own group badges, drawn for Crumbs (Aidan, Nov 17: "add a good few of our
// own"). Stored in groups.emoji as "crumbs:<id>"; drawn as a line icon on the group's colour.
// Places that can only show text (posters, names in a sentence) use the badge's stand-in emoji.
export type CrumbsBadge = {
  id: string
  label: string
  /** shown where only text fits */
  stand_in: string
  /** 24×24 line drawing; "dot:" entries are filled circles "cx,cy,r" */
  paths: string[]
}

export const CRUMBS_BADGES: CrumbsBadge[] = [
  {
    id: 'crumbs',
    label: 'Crumbs',
    stand_in: '🍞',
    paths: ['dot:8,15,2.6', 'dot:15,9,3', 'dot:16.5,17,1.7', 'dot:6,8,1.2'],
  },
  {
    id: 'loaf',
    label: 'Loaf',
    stand_in: '🍞',
    paths: [
      'M5 11a4 4 0 0 1 2-7.5h10A4 4 0 0 1 19 11v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
      'M9 8l1.5 2.5M13 8l1.5 2.5',
    ],
  },
  {
    id: 'croissant',
    label: 'Croissant',
    stand_in: '🥐',
    paths: [
      'M3 16c2-6 6-10 9-10s7 4 9 10c-2 1-4 .5-5-1-1.5 2-6.5 2-8 0-1 1.5-3 2-5 1z',
      'M9 9l1 4M15 9l-1 4',
    ],
  },
  {
    id: 'noodles',
    label: 'Noodle bowl',
    stand_in: '🍜',
    paths: ['M3 11h18a9 9 0 0 1-18 0z', 'M15 3l-3 7M19 4l-4 6', 'M9 21h6'],
  },
  {
    id: 'taco',
    label: 'Taco',
    stand_in: '🌮',
    paths: ['M3 18a9 9 0 0 1 18 0z', 'M7.5 14h.01M11 12h.01M15 13h.01M12 15.5h.01'],
  },
  {
    id: 'slice',
    label: 'Pizza slice',
    stand_in: '🍕',
    paths: ['M12 3l8.5 15.5a19 19 0 0 1-17 0z', 'M10 11h.01M13.5 13.5h.01M9.5 15.5h.01'],
  },
  {
    id: 'dumpling',
    label: 'Dumpling',
    stand_in: '🥟',
    paths: ['M3 16c0-5 4-8.5 9-8.5s9 3.5 9 8.5z', 'M8 9l1 3M12 7.5V11M16 9l-1 3'],
  },
  {
    id: 'cup',
    label: 'Coffee',
    stand_in: '☕',
    paths: [
      'M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z',
      'M16 11h2a2 2 0 0 1 0 4h-2',
      'M8 3v3M12 3v3',
    ],
  },
  {
    id: 'glass',
    label: 'Wine glass',
    stand_in: '🍷',
    paths: ['M8 3h8l-.8 6a3.2 3.2 0 0 1-6.4 0z', 'M12 12.5V20M8 21h8'],
  },
  {
    id: 'cupcake',
    label: 'Cupcake',
    stand_in: '🧁',
    paths: ['M6 12h12l-2 8H8z', 'M5.5 12a6.5 5 0 0 1 13 0', 'M12 5.5V7'],
  },
  {
    id: 'chef',
    label: 'Chef hat',
    stand_in: '🧑‍🍳',
    paths: [
      'M7 17v3h10v-3',
      'M7 17a4 4 0 0 1-.6-7.9A4.5 4.5 0 0 1 12 5.5a4.5 4.5 0 0 1 5.6 3.6A4 4 0 0 1 17 17z',
    ],
  },
  {
    id: 'cutlery',
    label: 'Fork and knife',
    stand_in: '🍽️',
    paths: ['M7 3v18M5 3v5a2 2 0 0 0 4 0V3', 'M17 3c-2.5 2-2.5 8 0 10v8'],
  },
  {
    id: 'home',
    label: 'Home kitchen',
    stand_in: '🏠',
    paths: ['M4 11l8-7 8 7v9H4z', 'M10 14c-.5 1 .5 1.5 0 2.5M14 14c-.5 1 .5 1.5 0 2.5'],
  },
  {
    id: 'pin',
    label: 'Food spot',
    stand_in: '📍',
    paths: [
      'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z',
      'M10 7v2.5a2 2 0 0 0 4 0V7M12 11.5V14',
    ],
  },
  {
    id: 'heart',
    label: 'Plate of love',
    stand_in: '❤️',
    paths: [
      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
      'M12 16s-3.5-2.2-3.5-4.6A1.9 1.9 0 0 1 12 10.3a1.9 1.9 0 0 1 3.5 1.1C15.5 13.8 12 16 12 16z',
    ],
  },
  {
    id: 'star',
    label: 'Star plate',
    stand_in: '⭐',
    paths: [
      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
      'M12 7.5l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z',
    ],
  },
]

const PREFIX = 'crumbs:'
export const badgeValue = (id: string) => `${PREFIX}${id}`

/** One of Crumbs' own badges, if that's what the group picked. */
export function crumbsBadge(value?: string | null): CrumbsBadge | null {
  if (!value?.startsWith(PREFIX)) return null
  const id = value.slice(PREFIX.length)
  return CRUMBS_BADGES.find((b) => b.id === id) ?? null
}
