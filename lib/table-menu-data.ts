// O15 v2 (Round 99): the table menu's content, built only from what the restaurant keeps in
// Crumbs — the owner's categories in their order (each with its own display), dishes with their
// size prices, sold out today, badges, diets, colour, local name, spice, "pairs with" and photo,
// the owner's posts as today's specials, and "Loved by N groups" from groups' own dish ratings.
// Dishes the owner hasn't put in a category are grouped by course, as before. Pure functions.
import {
  DIET_FILTERS, normalizeDisplay, type MenuItemView, type MenuSectionView, type MenuViewData, type SectionDisplay,
} from './menu-design.ts'

export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'late'

/** The table menu's extra data on an owner-verified page (Round 99, restaurant_menu_bits). */
export type MenuBits = {
  menu_design?: unknown
  menu_sections?: { id: string; name: string; name_local: string | null; menu_name: string | null; display: unknown }[] | null
  menu_items?: {
    id: string
    name: string
    section: string | null
    position: number | null
    prices: number[] | null
    sold_out_on: string | null
    badges: string[] | null
    swatch: string | null
    name_local: string | null
    spice: number | null
    pairs_with: string | null
    photo_path: string | null
    dietary?: string[] | null
  }[] | null
}

type Dish = {
  name: string
  price: number | null
  course: string | null
  dietary: string[] | null
  description: string | null
  served?: string[] | null
  menu_name?: string | null
}

export type MenuSource = MenuBits & {
  name: string
  name_local?: string | null
  cuisine?: string | null
  menu: Dish[]
  posts?: { title: string; body: string | null }[]
  top_dishes?: { name: string; groups: number }[]
}

const COURSES: [string, string][] = [['starter', 'Starters'], ['main', 'Mains'], ['side', 'Sides'], ['dessert', 'Desserts'], ['drink', 'Drinks'], ['', 'More']]
const key = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim()

/** Breakfast until 11, lunch until 4, dinner until 10, then late (Toronto clock minutes). */
export function mealAt(minutes: number): MealTime {
  if (minutes >= 300 && minutes < 660) return 'breakfast'
  if (minutes >= 660 && minutes < 960) return 'lunch'
  if (minutes >= 960 && minutes < 1320) return 'dinner'
  return 'late'
}
export const MEAL_LABEL: Record<MealTime, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', late: 'Late night' }

/** The restaurant's menus: the main one ('') first, then Brunch, Drinks… A–Z. */
export function menuNames(src: Pick<MenuSource, 'menu'>) {
  return [...new Set(src.menu.map((d) => d.menu_name?.trim() || ''))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
}

export type BuiltMenu = {
  data: MenuViewData
  /** dishes left out because they aren't served right now */
  notNow: number
  /** diet labels used on this menu (for the diner's filter) */
  diets: string[]
  /** some names are written in the restaurant's own language */
  hasLocal: boolean
}

export function buildTableMenu(
  src: MenuSource,
  opts: { today: string; meal?: MealTime | null; menu?: string | null; logo?: string | null },
): BuiltMenu {
  const extra = new Map((src.menu_items ?? []).map((m) => [m.name, m]))
  const loved = new Map((src.top_dishes ?? []).map((d) => [key(d.name), d.groups]))
  const names = menuNames(src)
  const which = opts.menu !== undefined && opts.menu !== null && names.includes(opts.menu) ? opts.menu : names[0] ?? ''
  let notNow = 0
  const dishes = src.menu.filter((d) => {
    if ((d.menu_name?.trim() || '') !== which) return false
    if (opts.meal && d.served?.length && !d.served.includes(opts.meal)) {
      notNow++
      return false
    }
    return true
  })

  const item = (d: Dish): MenuItemView & { _pos: number; _section: string | null; _course: string } => {
    const x = extra.get(d.name)
    return {
      id: x?.id ?? `${d.name}`,
      name: d.name,
      local: x?.name_local ?? null,
      description: d.description,
      prices: x?.prices?.length ? x.prices.map((p) => (p === null ? null : Number(p))) : d.price === null ? [] : [Number(d.price)],
      badges: x?.badges ?? [],
      diet: (x?.dietary ?? d.dietary ?? []).filter((t) => (DIET_FILTERS as readonly string[]).includes(t)),
      swatch: x?.swatch ?? null,
      spice: x?.spice ?? 0,
      pairs: x?.pairs_with ?? null,
      photo: x?.photo_path ?? null,
      soldOut: !!x?.sold_out_on && x.sold_out_on === opts.today,
      loved: loved.get(key(d.name)) ?? 0,
      _pos: x?.position ?? 10_000,
      _section: x?.section ?? null,
      _course: d.course ?? '',
    }
  }
  const items = dishes.map(item)
  const strip = ({ _pos, _section, _course, ...rest }: ReturnType<typeof item>): MenuItemView => (void _pos, void _section, void _course, rest)
  const byPos = (a: ReturnType<typeof item>, b: ReturnType<typeof item>) => a._pos - b._pos || a.name.localeCompare(b.name)

  const sections: MenuSectionView[] = []
  const ownSections = new Set<string>()
  for (const s of src.menu_sections ?? []) {
    ownSections.add(s.id)
    const inIt = items.filter((i) => i._section === s.id).sort(byPos)
    if (!inIt.length) continue
    sections.push({ id: s.id, name: s.name, local: s.name_local, display: normalizeDisplay(s.display), items: inIt.map(strip) })
  }
  const plain: SectionDisplay = normalizeDisplay(null)
  for (const [course, label] of COURSES) {
    const inIt = items.filter((i) => !i._section && (COURSES.some(([c]) => c === i._course) ? i._course : '') === course)
    if (inIt.length) sections.push({ id: `course-${course || 'more'}`, name: label, local: null, display: plain, items: inIt.sort(byPos).map(strip) })
  }
  // dishes in a category that no longer exists
  const orphans = items.filter((i) => i._section && !ownSections.has(i._section))
  if (orphans.length) sections.push({ id: 'course-other', name: 'More', local: null, display: plain, items: orphans.sort(byPos).map(strip) })

  const all = sections.flatMap((s) => s.items)
  return {
    data: {
      name: src.name,
      local: src.name_local ?? null,
      tag: [src.cuisine, which || null].filter(Boolean).join(' · ') || null,
      logo: opts.logo ? { img: opts.logo } : null,
      sections,
      specials: (src.posts ?? []).map((p) => ({ title: p.title, body: p.body })),
    },
    notNow,
    diets: DIET_FILTERS.filter((t) => all.some((i) => i.diet?.includes(t))),
    hasLocal: all.some((i) => !!i.local) || sections.some((s) => !!s.local) || !!src.name_local,
  }
}
