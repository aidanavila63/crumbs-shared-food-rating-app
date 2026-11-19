// O15 v2 (Round 99): how a restaurant's table menu (/r/<city>/<name>/menu) looks.
// The owner only picks the look here; everything on the menu (categories, dishes, prices,
// sold out, badges) comes from what they enter in Crumbs.
//   1 Look   – a ready-made style (its own artwork + 3 colourways made for it) or build-your-own
//              (a background pattern + primary / secondary / accent colours)
//   2 Fonts  – a pairing, or the style's own
//   3 Layout – how the page is arranged
//   4 Categories – each category's own display (set on the category, see SectionDisplay)
//   5 Logo   – where the logo from the restaurant page goes
// Extras: seasonal decorations, night mode, specials board, "Loved on Crumbs", diet filter,
// language switch, bigger text. Pure data and helpers, no network.

import { FRAMES } from './menu-art.ts'

export type ArtPath = { d: string; f: string; s: string; w: number; o: number; r: string }
export type ArtPiece = { h?: number; size?: number; top?: number; o?: number; v?: number | string; p: ArtPath[] }
/** A line of a full-page frame: `off` px in from the edge; `gap` px kept clear at each corner (negative = lines
 * run past each other); `box` = one rounded rectangle (with optional hand-drawn `tilt`). `key` P or A. */
export type FrameRule = { off: number; w: number; style: string; gap: number; mid: number; box: boolean; radius: number; tilt: number; key: string }
/** O15 v2: a full-page design for build-your-own menus (frame lines, corner ornaments, crest, dividers,
 * illustrations along a side). Stretches to any menu length. */
export type MenuFrame = {
  id: string; label: string; note: string; rules: FrameRule[]
  corner?: ArtPiece; corners?: 'all' | 'diag' | 'tl-br' | 'tr' | 'bottom'; csize?: number; cin?: number
  crest?: ArtPiece; div?: ArtPiece; top?: ArtPiece; bottom?: ArtPiece; side?: ArtPiece; mids?: ArtPiece
  pad: number; padLeft?: number; font: string; scheme: [string, string, string]; title?: 'banner'
}
export type ArtSet = { top: ArtPiece | null; div: ArtPiece | null; corner: ArtPiece | null; behind: ArtPiece | null }

export type Way = { name: string; P: string; S: string; A: string; O: string; O2: string; X?: string; Y?: string; G?: string; neon?: boolean }
export type FontSpec = { hf: string; bf: string; hw: string; it?: boolean; tt?: string; ls?: string }
export type MenuStyle = {
  id: string
  label: string
  group: 'cuisine' | 'shop'
  note: string
  bg: string
  frame?: 'gingham' | 'gold'
  title?: 'gold' | 'neon' | 'plaque'
  font: FontSpec
  layout: LayoutId
  ways: Way[]
}

export const LAYOUTS = [
  ['classic', 'Classic', 'Centred, dotted leaders'],
  ['list', 'Simple list', 'Left-aligned, prices right'],
  ['framed', 'Framed', 'Double border, small caps'],
  ['blocks', 'Bold blocks', 'Colour bars, price pills'],
  ['cards', 'Cards', 'Each category on a card'],
  ['poster', 'Poster', 'Big colour header'],
  ['minimal', 'Minimal', 'Quiet, lots of space'],
  ['tabs', 'Tabs', 'Category buttons on top'],
  ['magazine', 'Magazine', 'Big numbered sections'],
  ['receipt', 'Receipt', 'Typewriter ticket'],
  ['timeline', 'Timeline', 'Dots down a line'],
  ['board', 'Board', 'Framed chalkboard'],
  ['ribbon', 'Ribbons', 'Titles on ribbons'],
  ['paper', 'Paper sheet', 'Menu card on your background'],
  ['side', 'Side labels', 'Category names run sideways'],
] as const
export type LayoutId = (typeof LAYOUTS)[number][0]
export const LAYOUT_IDS = LAYOUTS.map((l) => l[0]) as LayoutId[]

/** How one category is shown. Picked per category in the owner's menu editor. */
export const EFFECTS = [
  ['list', 'Standard list', 'Name, description, price'],
  ['sizes', 'Sizes in columns', 'One price per size, e.g. pizza or pints'],
  ['swatches', 'Colour swatches', 'Tiles with a colour dot, prices optional'],
  ['chips', 'Name chips', 'Just names, e.g. flavours of the day'],
  ['ladder', 'Size steps', '1 → 2 → 3, e.g. scoops'],
  ['addons', 'Add-ons', '+1.50 extras as tags'],
  ['numbered', 'Numbered', 'Order by number'],
  ['featured', 'Featured first', 'First dish as a highlight card'],
  ['compact', 'Compact', 'Two columns, names and prices'],
  ['build', 'Build your own', 'Steps with options'],
  ['courses', 'Courses', 'Tasting menu, one price'],
  ['combo', 'Combos', 'Bundles with a big price'],
  ['photos', 'Photo cards', 'A photo for each dish'],
] as const
export type EffectId = (typeof EFFECTS)[number][0]
export const EFFECT_IDS = EFFECTS.map((e) => e[0]) as EffectId[]

export type SectionDisplay = {
  effect: EffectId
  /** size names for 'sizes' / 'ladder' (e.g. 10", 14", 18" or Half, Pint) */
  sizes: string[]
  /** 'swatches' and 'photos': show prices on the tiles */
  show_prices: boolean
  /** a line under the category name ("Changes every day", "4.50 each") */
  note: string
  /** 'featured': the label on the highlight card */
  label: string
}
export const DEFAULT_DISPLAY: SectionDisplay = { effect: 'list', sizes: [], show_prices: true, note: '', label: '' }

export function normalizeDisplay(raw: unknown): SectionDisplay {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const effect = EFFECT_IDS.includes(r.effect as EffectId) ? (r.effect as EffectId) : 'list'
  const sizes = Array.isArray(r.sizes) ? r.sizes.map((s) => String(s).trim().slice(0, 16)).filter(Boolean).slice(0, 4) : []
  return {
    effect,
    sizes,
    show_prices: r.show_prices !== false,
    note: typeof r.note === 'string' ? r.note.trim().slice(0, 120) : '',
    label: typeof r.label === 'string' ? r.label.trim().slice(0, 40) : '',
  }
}

export const BACKGROUNDS = [
  ['plain', 'Plain'], ['paper', 'Paper'], ['linen', 'Linen'], ['kraft', 'Kraft'], ['grid', 'Grid paper'],
  ['pinstripe', 'Pinstripe'], ['polka', 'Polka dots'], ['diagonal', 'Diagonal'], ['checker', 'Checker'],
  ['waves', 'Waves'], ['scallop', 'Scallops'], ['terrazzo', 'Terrazzo'], ['tiles', 'Tiles'], ['confetti', 'Confetti'],
  ['glow', 'Glow'], ['wood', 'Wood'], ['chalk', 'Chalk'],
] as const
export type BgId = (typeof BACKGROUNDS)[number][0]
export const BG_IDS = BACKGROUNDS.map((b) => b[0]) as BgId[]

/** Font pairings: id, label, heading font key, body font key, heading weight, italic, case, letter-spacing. */
export const PAIRINGS = [
  ['classic', 'Classic serif', 'playfair', 'lora', '700', false, 'none', '0'],
  ['modern', 'Modern sans', 'space', 'dmsans', '700', false, 'none', '-0.01em'],
  ['elegant', 'Elegant', 'cormorant', 'josefin', '700', false, 'none', '0'],
  ['oldstyle', 'Old style', 'fraunces', 'fraunces', '600', false, 'none', '0'],
  ['didone', 'Didone', 'abril', 'lora', '400', false, 'none', '0.01em'],
  ['slab', 'Slab', 'alfaslab', 'karla', '400', false, 'none', '0'],
  ['condensed', 'Condensed', 'bebas', 'dmsans', '400', false, 'uppercase', '0.03em'],
  ['grotesk', 'Heavy grotesk', 'archivo', 'karla', '400', false, 'none', '0'],
  ['signage', 'Signage', 'bungee', 'dmsans', '400', false, 'none', '0'],
  ['rounded', 'Rounded', 'fredoka', 'figtree', '600', false, 'none', '0'],
  ['retro', 'Retro', 'righteous', 'dmsans', '400', false, 'none', '0'],
  ['deco', 'Deco', 'poiret', 'josefin', '400', false, 'uppercase', '0.1em'],
  ['hand', 'Handwritten', 'caveat', 'karla', '700', false, 'none', '0'],
  ['marker', 'Marker', 'marker', 'dmsans', '400', false, 'none', '0'],
  ['script', 'Script', 'pacifico', 'karla', '400', false, 'none', '0'],
  ['brush', 'Brush', 'kaushan', 'dmsans', '400', false, 'none', '0'],
  ['western', 'Western', 'rye', 'lora', '400', false, 'none', '0'],
  ['typewriter', 'Typewriter', 'elite', 'courier', '400', false, 'none', '0'],
  ['mincho', 'Mincho', 'shippori', 'karla', '700', false, 'none', '0'],
] as const
export type PairingId = (typeof PAIRINGS)[number][0]
export const PAIRING_IDS = PAIRINGS.map((p) => p[0]) as PairingId[]
export const pairingFont = (id: string): FontSpec | null => {
  const p = PAIRINGS.find((x) => x[0] === id)
  return p ? { hf: p[2], bf: p[3], hw: p[4], it: p[5], tt: p[6], ls: p[7] } : null
}

/** Shortcuts for build-your-own: primary, secondary (background), accent. */
export const SCHEMES: [string, string, string, string][] = [
  ['Plum and honey', '#7B2D5B', '#FBF4E8', '#E9A23B'],
  ['Midnight and gold', '#D4AF37', '#121114', '#E8D9A8'],
  ['Forest', '#2F5D3A', '#F3F1E7', '#B5651D'],
  ['Terracotta', '#B5523B', '#FFF7EF', '#2F6B5A'],
  ['Ocean', '#0F4C81', '#F2F7FB', '#E07A5F'],
  ['Chalk', '#C99A3B', '#2B312E', '#F2D06B'],
  ['Blush', '#C2577F', '#FFF5F8', '#3BA39A'],
  ['Mono', '#161616', '#FAFAFA', '#161616'],
  ['Charcoal and cream', '#E9DFC9', '#2B2B2B', '#C8A96A'],
  ['Ivory and ink', '#1F1F1F', '#FBF8F1', '#8C6D2C'],
  ['Slate and sage', '#DDE5D0', '#2F3A35', '#B8C99A'],
]

export const STYLES: MenuStyle[] = ([
  {"id": "trattoria", "label": "Trattoria", "group": "cuisine", "note": "Gingham frame, olive garland", "bg": "linen", "frame": "gingham", "font": {"hf": "playfair", "bf": "lora", "hw": "700", "it": true}, "layout": "classic", "ways": [{"name": "Rosso", "P": "#A4161A", "S": "#FFF8EE", "A": "#2F6B3A", "O": "#5E7D3A", "O2": "#2E3B1F"}, {"name": "Verde", "P": "#2F6B3A", "S": "#F8F5EC", "A": "#A4161A", "O": "#6B8E3A", "O2": "#3B2A1A"}, {"name": "Notte", "P": "#E8C07A", "S": "#1F1A17", "A": "#E07A5F", "O": "#8FA65A", "O2": "#C9B27A"}]},
  {"id": "azulejo", "label": "Azulejo", "group": "cuisine", "note": "Painted tile band and corners", "bg": "glaze", "font": {"hf": "fraunces", "bf": "karla", "hw": "600"}, "layout": "list", "ways": [{"name": "Lisboa", "P": "#1F4E9C", "S": "#F7F9FC", "A": "#B07A0C", "O": "#7DA0DA", "O2": "#1F4E9C"}, {"name": "Amarelo", "P": "#9C5B0E", "S": "#FFFBF1", "A": "#1F4E9C", "O": "#E0B04A", "O2": "#9C5B0E"}, {"name": "Verde", "P": "#1E6B54", "S": "#F6FAF7", "A": "#B5651D", "O": "#7FB8A4", "O2": "#1E6B54"}]},
  {"id": "papel", "label": "Papel picado", "group": "cuisine", "note": "Cut-paper flag garland", "bg": "kraft", "font": {"hf": "lilita", "bf": "dmsans", "hw": "400"}, "layout": "blocks", "ways": [{"name": "Fiesta", "P": "#D6336C", "S": "#FFF6EA", "A": "#12B886", "O": "#F59F00", "O2": "#228BE6"}, {"name": "Rosa", "P": "#C2185B", "S": "#FFF1F5", "A": "#7B1FA2", "O": "#FF8A65", "O2": "#26A69A"}, {"name": "Noche", "P": "#FF5C8A", "S": "#1B1A2E", "A": "#2EC4B6", "O": "#FFB703", "O2": "#4CC9F0"}]},
  {"id": "washi", "label": "Washi and ensō", "group": "cuisine", "note": "Brush circle, seal, wave scales", "bg": "paper", "font": {"hf": "shippori", "bf": "karla", "hw": "700"}, "layout": "minimal", "ways": [{"name": "Sumi", "P": "#1A1A1A", "S": "#F5F0E6", "A": "#BC002D", "O": "#BC002D", "O2": "#1A1A1A"}, {"name": "Aizome", "P": "#1F3A5F", "S": "#F2F0EA", "A": "#B5462F", "O": "#B5462F", "O2": "#1F3A5F"}, {"name": "Matcha", "P": "#3F5A2A", "S": "#F4F1E4", "A": "#9C2F2F", "O": "#9C2F2F", "O2": "#3F5A2A"}]},
  {"id": "lantern", "label": "Red lantern", "group": "cuisine", "note": "Hanging lanterns, gold fret corners", "bg": "lacquer", "frame": "gold", "title": "gold", "font": {"hf": "playfair", "bf": "karla", "hw": "700"}, "layout": "poster", "ways": [{"name": "Lacquer", "P": "#E9B949", "S": "#7A1214", "A": "#F2D27A", "O": "#C8102E", "O2": "#E9B949"}, {"name": "Jade", "P": "#0F5E4A", "S": "#F4F1E6", "A": "#9C1C1F", "O": "#C8102E", "O2": "#C99419"}, {"name": "Porcelain", "P": "#1D3F8F", "S": "#F7F9FD", "A": "#B22222", "O": "#1D3F8F", "O2": "#7F9BD3"}]},
  {"id": "meander", "label": "Greek key", "group": "cuisine", "note": "Meander band, laurel divider", "bg": "plain", "font": {"hf": "marcellus", "bf": "karla", "hw": "400", "tt": "uppercase", "ls": "0.12em"}, "layout": "list", "ways": [{"name": "Aegean", "P": "#0D5EAF", "S": "#FBFDFF", "A": "#B88A12", "O": "#0D5EAF", "O2": "#0D5EAF"}, {"name": "Amphora", "P": "#1A1A1A", "S": "#E9A25F", "A": "#1A1A1A", "O": "#1A1A1A", "O2": "#1A1A1A"}, {"name": "Olive", "P": "#4B5A2A", "S": "#F7F5EC", "A": "#8C6D2C", "O": "#4B5A2A", "O2": "#4B5A2A"}]},
  {"id": "toran", "label": "Marigold toran", "group": "cuisine", "note": "Marigold garland, mandala", "bg": "paper", "font": {"hf": "yatra", "bf": "karla", "hw": "400"}, "layout": "classic", "ways": [{"name": "Saffron", "P": "#B23A0C", "S": "#FFF6E8", "A": "#0F766E", "O": "#F59E0B", "O2": "#3F7D3A"}, {"name": "Peacock", "P": "#0F4C5C", "S": "#F3FAF8", "A": "#B5179E", "O": "#F4A261", "O2": "#2A9D8F"}, {"name": "Rani", "P": "#B5179E", "S": "#FFF4FA", "A": "#C2410C", "O": "#FFB703", "O2": "#2B9348"}]},
  {"id": "zellige", "label": "Zellige arch", "group": "cuisine", "note": "Star tiles, pointed arch", "bg": "plain", "font": {"hf": "amiri", "bf": "karla", "hw": "700"}, "layout": "classic", "ways": [{"name": "Teal and brass", "P": "#0F6E66", "S": "#FBF5EA", "A": "#B5651D", "O": "#0F6E66", "O2": "#C9A227"}, {"name": "Midnight", "P": "#E0C068", "S": "#14213D", "A": "#E0C068", "O": "#2A9D8F", "O2": "#E0C068"}, {"name": "Terracotta", "P": "#9C3D24", "S": "#FBF1E6", "A": "#1F6F8B", "O": "#9C3D24", "O2": "#1F6F8B"}]},
  {"id": "iznik", "label": "Iznik tulips", "group": "cuisine", "note": "Tulip tiles in cobalt and red", "bg": "glaze", "font": {"hf": "cinzel", "bf": "karla", "hw": "700"}, "layout": "framed", "ways": [{"name": "Iznik", "P": "#1D3F8F", "S": "#FDFCF8", "A": "#C0392B", "O": "#1D3F8F", "O2": "#1BA3A3"}, {"name": "Night", "P": "#E9C46A", "S": "#10203A", "A": "#F28482", "O": "#4EA8DE", "O2": "#2EC4B6"}, {"name": "Coral", "P": "#B23A48", "S": "#FFF8F3", "A": "#1D3F8F", "O": "#B23A48", "O2": "#2A9D8F"}]},
  {"id": "awning", "label": "Café awning", "group": "cuisine", "note": "Striped scalloped awning", "bg": "paper", "font": {"hf": "cormorant", "bf": "lora", "hw": "700", "it": true}, "layout": "framed", "ways": [{"name": "Rouge", "P": "#B3202A", "S": "#F7F3EA", "A": "#1B2340", "O": "#B3202A", "O2": "#FFFFFF"}, {"name": "Vert", "P": "#1E5945", "S": "#F6F3EA", "A": "#B23A48", "O": "#1E5945", "O2": "#FFFFFF"}, {"name": "Noir", "P": "#1B1B1B", "S": "#FBF8F1", "A": "#8C6A3E", "O": "#1B1B1B", "O2": "#FFFFFF"}]},
  {"id": "doily", "label": "Tea room lace", "group": "cuisine", "note": "Lace doily behind the name", "bg": "linen", "font": {"hf": "cormorant", "bf": "lora", "hw": "700", "it": true}, "layout": "framed", "ways": [{"name": "Rose", "P": "#7A1F3D", "S": "#F6E4E8", "A": "#3E7C3A", "O": "#E8A0B4", "O2": "#FFFFFF", "G": "#5E8C55"}, {"name": "Sage", "P": "#3E5C3A", "S": "#E6EEE2", "A": "#8C3B5A", "O": "#C77D9A", "O2": "#FFFFFF", "G": "#3E5C3A"}, {"name": "Earl Grey", "P": "#3B3F5C", "S": "#E6E7F0", "A": "#8C6D2C", "O": "#B8A1C9", "O2": "#FFFFFF", "G": "#6B7A5A"}]},
  {"id": "bierhalle", "label": "Beer hall", "group": "cuisine", "note": "Diamond band, blackletter, hops", "bg": "wood", "font": {"hf": "fraktur", "bf": "alegreya", "hw": "400"}, "layout": "blocks", "ways": [{"name": "Bayern", "P": "#1F3A68", "S": "#F6F1E7", "A": "#9C7524", "O": "#2D7DD2", "O2": "#FFFFFF", "G": "#5E8C3A"}, {"name": "Wald", "P": "#2F4F2F", "S": "#F3EEDF", "A": "#9C6B30", "O": "#2F4F2F", "O2": "#E9DFC6", "G": "#6B8E3A"}, {"name": "Oktober", "P": "#7A2E1E", "S": "#FBF1DC", "A": "#2D5AA0", "O": "#2D5AA0", "O2": "#FFFFFF", "G": "#6B8E3A"}]},
  {"id": "wycinanki", "label": "Folk paper-cut", "group": "cuisine", "note": "Layered paper-cut flowers", "bg": "plain", "font": {"hf": "alegreya", "bf": "alegreya", "hw": "700"}, "layout": "classic", "ways": [{"name": "Łowicz", "P": "#C1121F", "S": "#FFFDF7", "A": "#2F5D8A", "O": "#F4A300", "O2": "#2B9348", "G": "#2B9348"}, {"name": "Night folk", "P": "#F94144", "S": "#161616", "A": "#F9C74F", "O": "#F9C74F", "O2": "#90BE6D", "G": "#90BE6D"}, {"name": "Blue", "P": "#1D4E89", "S": "#F7FAFF", "A": "#C1121F", "O": "#F4A300", "O2": "#00A6A6", "G": "#2B9348"}]},
  {"id": "kente", "label": "Kente", "group": "cuisine", "note": "Woven band, Adinkra rings", "bg": "paper", "font": {"hf": "archivo", "bf": "dmsans", "hw": "400"}, "layout": "magazine", "ways": [{"name": "Gold and green", "P": "#00653A", "S": "#FFF8EA", "A": "#C2410C", "O": "#F2B705", "O2": "#1A1A1A"}, {"name": "Earth", "P": "#6B3E26", "S": "#F8F0E3", "A": "#C2410C", "O": "#D9A441", "O2": "#2E1E14"}, {"name": "Indigo", "P": "#23395B", "S": "#F3F5FA", "A": "#C2410C", "O": "#F2B705", "O2": "#23395B"}]},
  {"id": "temple", "label": "Temple gable", "group": "cuisine", "note": "Layered roof with gold finials", "bg": "glow", "font": {"hf": "mitr", "bf": "mitr", "hw": "600"}, "layout": "ribbon", "ways": [{"name": "Royal", "P": "#5B2A86", "S": "#FFF8EC", "A": "#9A6E0A", "O": "#D4A017", "O2": "#5B2A86"}, {"name": "Emerald", "P": "#0B6E4F", "S": "#F6FAF4", "A": "#9A6E0A", "O": "#D4A017", "O2": "#0B6E4F"}, {"name": "Saffron", "P": "#B45309", "S": "#FFF7E6", "A": "#6B21A8", "O": "#F59E0B", "O2": "#B45309"}]},
  {"id": "bojagi", "label": "Bojagi", "group": "cuisine", "note": "Patchwork wrapping cloth", "bg": "linen", "font": {"hf": "blackhan", "bf": "dmsans", "hw": "400"}, "layout": "blocks", "ways": [{"name": "Obangsaek", "P": "#C8102E", "S": "#F7F6F2", "A": "#003478", "O": "#F2C14E", "O2": "#2A9D8F"}, {"name": "Celadon", "P": "#2F6F6A", "S": "#F2F7F4", "A": "#8C5A3C", "O": "#A7D3C6", "O2": "#D9EDE5"}, {"name": "Ink", "P": "#1A1A1A", "S": "#F4F1EA", "A": "#C8102E", "O": "#9B9B9B", "O2": "#D6D2C4"}]},
  {"id": "lotus", "label": "Lotus pond", "group": "cuisine", "note": "Lotus, lily pads, bamboo", "bg": "paper", "font": {"hf": "bevietnam", "bf": "bevietnam", "hw": "700"}, "layout": "timeline", "ways": [{"name": "Sen", "P": "#2F6B3C", "S": "#F3F7EF", "A": "#C2416B", "O": "#E88CA8", "O2": "#4E8C4A"}, {"name": "Lacquer", "P": "#E2B65C", "S": "#2A1A12", "A": "#E88CA8", "O": "#C2416B", "O2": "#6C9A5B"}, {"name": "Indigo", "P": "#1F3A5F", "S": "#F2F5F9", "A": "#C2416B", "O": "#E88CA8", "O2": "#3C6E71"}]},
  {"id": "copa", "label": "Copacabana", "group": "cuisine", "note": "Wave pavement band", "bg": "plain", "font": {"hf": "bebas", "bf": "dmsans", "hw": "400", "tt": "uppercase", "ls": "0.03em"}, "layout": "board", "ways": [{"name": "Calçadão", "P": "#1A1A1A", "S": "#FFFFFF", "A": "#00843D", "O": "#1A1A1A", "O2": "#FFFFFF"}, {"name": "Tropical", "P": "#00703C", "S": "#FFFDF2", "A": "#E85D04", "O": "#00703C", "O2": "#FFF4C2"}, {"name": "Samba", "P": "#F6C700", "S": "#0B3D2E", "A": "#F6C700", "O": "#F6C700", "O2": "#0B3D2E"}]},
  {"id": "andean", "label": "Andean weave", "group": "cuisine", "note": "Textile band, stepped cross", "bg": "linen", "font": {"hf": "josefin", "bf": "josefin", "hw": "700", "tt": "uppercase", "ls": "0.06em"}, "layout": "cards", "ways": [{"name": "Cusco", "P": "#C8102E", "S": "#FFF9F2", "A": "#1F6F8B", "O": "#F2A541", "O2": "#3A7D44"}, {"name": "Lima", "P": "#1F3A5F", "S": "#F5F5F0", "A": "#B5470A", "O": "#E9C46A", "O2": "#C8102E"}, {"name": "Ceviche", "P": "#2A9D8F", "S": "#F7FBF9", "A": "#C2533A", "O": "#F4A261", "O2": "#264653"}]},
  {"id": "island", "label": "Island sunset", "group": "cuisine", "note": "Striped sun, palm, waves", "bg": "plain", "font": {"hf": "righteous", "bf": "dmsans", "hw": "400"}, "layout": "cards", "ways": [{"name": "Sunset", "P": "#0E8577", "S": "#FFFBEA", "A": "#D9481F", "O": "#FF9F1C", "O2": "#0E8577", "X": "#7A4A2A", "Y": "#2D8A4E"}, {"name": "Lagoon", "P": "#006D77", "S": "#F1FAF9", "A": "#C2603A", "O": "#F4A261", "O2": "#83C5BE", "X": "#7A4A2A", "Y": "#2A9D8F"}, {"name": "Reggae", "P": "#1B7F3B", "S": "#FFF9E6", "A": "#D62828", "O": "#F4C430", "O2": "#1B7F3B", "X": "#5A3A1A", "Y": "#1B7F3B"}]},
  {"id": "flamenco", "label": "Flamenco", "group": "cuisine", "note": "Polka-dot ruffles, fan", "bg": "polka", "font": {"hf": "abril", "bf": "karla", "hw": "400"}, "layout": "ribbon", "ways": [{"name": "Rojo", "P": "#A3161C", "S": "#FFF7EC", "A": "#1A1A1A", "O": "#E0A100", "O2": "#FFFFFF"}, {"name": "Sevilla", "P": "#1F4E9C", "S": "#FFF8EA", "A": "#A3161C", "O": "#F2C14E", "O2": "#FFFFFF"}, {"name": "Noche", "P": "#E63946", "S": "#141414", "A": "#F1C40F", "O": "#F1C40F", "O2": "#FFFFFF"}]},
  {"id": "diner", "label": "Diner neon", "group": "shop", "note": "Chrome sign, checker strip, glow", "bg": "plain", "title": "neon", "font": {"hf": "righteous", "bf": "dmsans", "hw": "400"}, "layout": "blocks", "ways": [{"name": "Midnight", "P": "#FF4D6D", "S": "#10131C", "A": "#48E5C2", "O": "#C9D1D9", "O2": "#1A1A1A", "neon": true}, {"name": "Cherry", "P": "#D7263D", "S": "#FFF4EC", "A": "#0E7C86", "O": "#9AA5B1", "O2": "#1A1A1A"}, {"name": "Mint", "P": "#0E7C86", "S": "#E8FFF8", "A": "#D7263D", "O": "#9AA5B1", "O2": "#1A1A1A"}]},
  {"id": "pub", "label": "Brass and wood", "group": "shop", "note": "Brass plaque on dark panels", "bg": "wood", "title": "plaque", "font": {"hf": "alfaslab", "bf": "dmsans", "hw": "400"}, "layout": "board", "ways": [{"name": "Mahogany", "P": "#D9B26F", "S": "#2B1A12", "A": "#E3B448", "O": "#C9A04A", "O2": "#2B1A12"}, {"name": "Racing green", "P": "#D9B26F", "S": "#12261C", "A": "#E3B448", "O": "#C9A04A", "O2": "#12261C"}, {"name": "Oak", "P": "#5A3A1E", "S": "#F3E7D3", "A": "#8A5A2B", "O": "#C9A04A", "O2": "#2B1A12"}]},
  {"id": "pizzeria", "label": "Wood-fired oven", "group": "shop", "note": "Brick oven arch with flames", "bg": "paper", "font": {"hf": "oswald", "bf": "dmsans", "hw": "600", "tt": "uppercase", "ls": "0.02em"}, "layout": "list", "ways": [{"name": "Brick", "P": "#B5462F", "S": "#FFF8EE", "A": "#2E7D32", "O": "#8C3A28", "O2": "#2B1A12", "X": "#F57C00", "Y": "#FFC93C", "G": "#2E7D32"}, {"name": "Napoli", "P": "#1F4E9C", "S": "#F8FAFD", "A": "#C0392B", "O": "#2E5DAA", "O2": "#1B2440", "X": "#F57C00", "Y": "#FFC93C", "G": "#2E7D32"}, {"name": "Basil", "P": "#2E7D32", "S": "#FBFAF2", "A": "#C0392B", "O": "#7A4A2A", "O2": "#2B1A12", "X": "#F57C00", "Y": "#FFC93C", "G": "#2E7D32"}]},
  {"id": "icecream", "label": "Ice cream drip", "group": "shop", "note": "Drippy edge with sprinkles", "bg": "polka", "font": {"hf": "pacifico", "bf": "dmsans", "hw": "400"}, "layout": "cards", "ways": [{"name": "Strawberry", "P": "#E05780", "S": "#FFF6F8", "A": "#2E8C84", "O": "#FFD166", "O2": "#7AD3F7", "X": "#E3B26B"}, {"name": "Mint choc", "P": "#3BA39A", "S": "#F1FBF8", "A": "#5A3825", "O": "#5A3825", "O2": "#F7C6D9", "X": "#E3B26B"}, {"name": "Blueberry", "P": "#5C6BC0", "S": "#F5F6FF", "A": "#C2416B", "O": "#FFD166", "O2": "#F48FB1", "X": "#E3B26B"}]},
  {"id": "cafe", "label": "Kraft café", "group": "shop", "note": "Kraft paper, cup and coffee rings", "bg": "kraft", "font": {"hf": "marker", "bf": "dmsans", "hw": "400"}, "layout": "list", "ways": [{"name": "Kraft", "P": "#3B2618", "S": "#E9D8BC", "A": "#2F6B5A", "O": "#3B2618", "O2": "#3B2618", "X": "#6F4E37"}, {"name": "Espresso", "P": "#E9D8BC", "S": "#2A1C14", "A": "#E3A857", "O": "#E9D8BC", "O2": "#E9D8BC", "X": "#C49A6C"}, {"name": "Oat", "P": "#6F4E37", "S": "#F5EFE3", "A": "#2F6B5A", "O": "#6F4E37", "O2": "#6F4E37", "X": "#8B6B4A"}]},
  {"id": "bakery", "label": "Bakehouse", "group": "shop", "note": "Cake-box edge, wheat sheaf", "bg": "linen", "font": {"hf": "fraunces", "bf": "karla", "hw": "700", "it": true}, "layout": "classic", "ways": [{"name": "Butter", "P": "#B5523B", "S": "#FFF8EA", "A": "#5E8065", "O": "#D49A45", "O2": "#B5523B"}, {"name": "Rose", "P": "#B23A6A", "S": "#FFF3F6", "A": "#5E8065", "O": "#D49A45", "O2": "#B23A6A"}, {"name": "Rye", "P": "#5A3A22", "S": "#F6EEE2", "A": "#B5523B", "O": "#B98A55", "O2": "#5A3A22"}]},
  {"id": "deco", "label": "Art deco bar", "group": "shop", "note": "Gold sunburst, stepped corners", "bg": "plain", "frame": "gold", "title": "gold", "font": {"hf": "poiret", "bf": "josefin", "hw": "400", "tt": "uppercase", "ls": "0.12em"}, "layout": "minimal", "ways": [{"name": "Gatsby", "P": "#D4AF37", "S": "#0E0E10", "A": "#E8D9A8", "O": "#D4AF37", "O2": "#8C6B1F"}, {"name": "Emerald", "P": "#D4AF37", "S": "#0B2B26", "A": "#E8D9A8", "O": "#D4AF37", "O2": "#8C6B1F"}, {"name": "Champagne", "P": "#1A1A1A", "S": "#F7F1E3", "A": "#7A5C14", "O": "#B8942F", "O2": "#7A5C14"}]},
  {"id": "smokehouse", "label": "Smokehouse", "group": "shop", "note": "Rope, Texas stars, brand ring", "bg": "wood", "font": {"hf": "rye", "bf": "dmsans", "hw": "400"}, "layout": "board", "ways": [{"name": "Mesquite", "P": "#E8833A", "S": "#1C1A17", "A": "#F2C14E", "O": "#E8833A", "O2": "#F2C14E", "X": "#C9A36A"}, {"name": "Brisket", "P": "#E9C46A", "S": "#2A1712", "A": "#E76F51", "O": "#E9C46A", "O2": "#E76F51", "X": "#C9A36A"}, {"name": "Butcher paper", "P": "#8C2F1B", "S": "#F4EBDD", "A": "#A8390F", "O": "#8C2F1B", "O2": "#A8390F", "X": "#A88452"}]},
  {"id": "bubbletea", "label": "Bubble tea", "group": "shop", "note": "Milk tea, pearls and bubbles", "bg": "confetti", "font": {"hf": "fredoka", "bf": "figtree", "hw": "600"}, "layout": "cards", "ways": [{"name": "Taro", "P": "#7A4FBF", "S": "#FBF7FF", "A": "#C2386E", "O": "#D9C7F0", "O2": "#3B2A1A"}, {"name": "Matcha", "P": "#4F7A3A", "S": "#F5FAF0", "A": "#B14A72", "O": "#CFE3B4", "O2": "#3B2A1A"}, {"name": "Brown sugar", "P": "#8B5A2B", "S": "#FFF8F0", "A": "#B14A72", "O": "#EBC79A", "O2": "#3B1F0E"}]}
] as unknown) as MenuStyle[]

export const styleById = (id: string | null | undefined) => STYLES.find((s) => s.id === id) ?? null
export const frameById = (id: string | null | undefined) => FRAMES.find((f) => f.id === id) ?? null

// ---------- the owner's choices ----------
export type LogoPos = 'top' | 'side' | 'band' | 'watermark' | 'none'
export const LOGO_POS: [LogoPos, string][] = [['top', 'Top'], ['side', 'Beside name'], ['band', 'On the band'], ['watermark', 'Watermark'], ['none', 'Hidden']]

export type MenuDesign = {
  v: 2
  mode: 'style' | 'custom'
  /** ready-made style id and which of its three colourways */
  style: string
  way: number
  /** build-your-own: background pattern and primary / secondary (background) / accent */
  bg: BgId
  /** build-your-own: a full-page design (frame, corners, crest…) or null */
  frame: string | null
  colours: [string, string, string]
  /** 'style' = the style's own pairing (build-your-own falls back to Classic serif) */
  font: 'style' | PairingId
  /** null = the style's suggested layout (build-your-own: Classic) */
  layout: LayoutId | null
  logo: LogoPos
  plate: boolean
  /** seasonal decorations (Christmas, Halloween, Valentine's, Lunar New Year, Diwali) */
  seasonal: boolean
  /** string lights from May 15 to Sep 15 */
  patio: boolean
  /** 'HH:MM': switch to a dark colourway from then until 5 am (bars, lounges) */
  night: string | null
  /** show the restaurant's own posts as a "Today" board on top */
  specials: boolean
  /** hearts on dishes that groups on Crumbs love */
  loved: boolean
}

export const DEFAULT_DESIGN: MenuDesign = {
  v: 2, mode: 'custom', style: 'trattoria', way: 0, bg: 'paper', frame: null, colours: ['#7B2D5B', '#FBF4E8', '#E9A23B'],
  font: 'style', layout: null, logo: 'top', plate: false, seasonal: true, patio: false, night: null, specials: true, loved: true,
}

export const normHex = (h: unknown): string | null => {
  if (typeof h !== 'string') return null
  const s = h.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toUpperCase()
  return null
}

/** Whatever is stored (or nothing) → a complete, safe design. Falls back to the Round 95 look. */
export function normalizeDesign(raw: unknown, legacyTheme?: string | null): MenuDesign {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 2) return legacyLook(legacyTheme)
  const r = raw as Record<string, unknown>
  const d: MenuDesign = { ...DEFAULT_DESIGN }
  d.mode = r.mode === 'style' ? 'style' : 'custom'
  d.style = styleById(r.style as string)?.id ?? DEFAULT_DESIGN.style
  d.way = [0, 1, 2].includes(Number(r.way)) ? Number(r.way) : 0
  d.bg = BG_IDS.includes(r.bg as BgId) ? (r.bg as BgId) : 'paper'
  d.frame = typeof r.frame === 'string' && FRAMES.some((f) => f.id === r.frame) ? r.frame : null
  const c = Array.isArray(r.colours) ? r.colours.map(normHex) : []
  d.colours = [c[0] ?? DEFAULT_DESIGN.colours[0], c[1] ?? DEFAULT_DESIGN.colours[1], c[2] ?? DEFAULT_DESIGN.colours[2]]
  d.font = r.font === 'style' || PAIRING_IDS.includes(r.font as PairingId) ? (r.font as MenuDesign['font']) : 'style'
  d.layout = LAYOUT_IDS.includes(r.layout as LayoutId) ? (r.layout as LayoutId) : null
  d.logo = LOGO_POS.some(([k]) => k === r.logo) ? (r.logo as LogoPos) : 'top'
  d.plate = r.plate === true
  d.seasonal = r.seasonal !== false
  d.patio = r.patio === true
  d.night = typeof r.night === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.night) ? r.night : null
  d.specials = r.specials !== false
  d.loved = r.loved !== false
  return d
}

/** The 33 looks from Round 95 → the closest new design, so nobody's menu changes overnight. */
export function legacyLook(id: string | null | undefined): MenuDesign {
  const style: Record<string, [string, number]> = {
    portuguese: ['azulejo', 0], italian: ['trattoria', 0], french: ['awning', 0], english: ['doily', 0], japanese: ['washi', 0],
    chinese: ['lantern', 0], korean: ['bojagi', 0], thai: ['temple', 0], vietnamese: ['lotus', 0], indian: ['toran', 0],
    mexican: ['papel', 0], greek: ['meander', 0], 'middle-eastern': ['zellige', 0], spanish: ['flamenco', 0], caribbean: ['island', 0],
    'american-diner': ['diner', 1], german: ['bierhalle', 0], 'black-gold': ['deco', 0], pub: ['pub', 0], neon: ['diner', 0], cafe: ['cafe', 2],
  }
  const custom: Record<string, [BgId, string, string, string, PairingId, LayoutId]> = {
    crumbs: ['paper', '#7B2D5B', '#FBF4E8', '#E9A23B', 'classic', 'classic'],
    ethiopian: ['linen', '#1E7B3A', '#FBF6EC', '#C0392B', 'oldstyle', 'list'],
    filipino: ['confetti', '#0038A8', '#FFFAF0', '#CE1126', 'rounded', 'blocks'],
    'high-end': ['plain', '#111111', '#FFFFFF', '#111111', 'didone', 'minimal'],
    mosaic: ['terrazzo', '#1E6E7E', '#F7F4EE', '#E07A5F', 'classic', 'classic'],
    rustic: ['wood', '#7A4A22', '#EFE4D2', '#7A4A22', 'slab', 'list'],
    minimal: ['plain', '#161616', '#FAFAFA', '#161616', 'modern', 'minimal'],
    chalkboard: ['chalk', '#F2D06B', '#2B312E', '#F2D06B', 'hand', 'board'],
    seaside: ['waves', '#0F4C81', '#F2F7FB', '#0F4C81', 'classic', 'list'],
    garden: ['polka', '#3E7C3A', '#F1F6EC', '#3E7C3A', 'oldstyle', 'classic'],
    vintage: ['linen', '#8B3A2B', '#F3E9D7', '#8B3A2B', 'didone', 'framed'],
    bold: ['checker', '#111111', '#FFE14D', '#111111', 'grotesk', 'blocks'],
    pastel: ['confetti', '#C2577F', '#FFF5F8', '#C2577F', 'rounded', 'cards'],
  }
  if (id && style[id]) return { ...DEFAULT_DESIGN, mode: 'style', style: style[id][0], way: style[id][1] }
  const c = custom[id ?? 'crumbs'] ?? custom.crumbs
  return { ...DEFAULT_DESIGN, mode: 'custom', bg: c[0], colours: [c[1], c[2], c[3]], font: c[4], layout: c[5] }
}

// ---------- colour helpers ----------
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const hex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()
export const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b)
  return hex(x.map((v, i) => v + (y[i] - v) * t))
}
export const luminance = (h: string) => {
  const c = rgb(h).map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
/** WCAG contrast ratio between two #RRGGBB colours. */
export const contrast = (a: string, b: string) => {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** The nearest deeper or lighter shade of `fg` that reaches `min` on `bg`. */
export function readable(fg: string, bg: string, min: number) {
  if (contrast(fg, bg) >= min) return fg
  let best: string | null = null, bestI = 99
  for (const target of ['#000000', '#FFFFFF'])
    for (let i = 1; i <= 20; i++) {
      const c = mix(fg, target, i * 0.05)
      if (contrast(c, bg) >= min) {
        if (i < bestI) { best = c; bestI = i }
        break
      }
    }
  return best ?? (contrast('#000000', bg) > contrast('#FFFFFF', bg) ? '#000000' : '#FFFFFF')
}
export const onColour = (bg: string) => (contrast('#FFFFFF', bg) >= contrast('#141414', bg) ? '#FFFFFF' : '#141414')

export type MenuTheme = {
  dark: boolean
  bg: string; ink: string; head: string; headSmall: string; price: string; muted: string; line: string; surface: string
  P: string; A: string; onP: string; onA: string; badgeBg: string; badgeInk: string; accent3: string; priceLine: string
  /** contrast ratios, for the owner's "Easy to read?" panel */
  crText: number; crHead: number; crPrice: number; headChanged: boolean; priceChanged: boolean
}

/** Text colours worked out from the three colours, always readable on the background. */
export function buildTheme(P: string, S: string, A: string): MenuTheme {
  const dark = luminance(S) < 0.2
  const ink = readable(dark ? mix(S, '#FFFFFF', 0.93) : mix(P, '#000000', 0.8), S, 7)
  const head = readable(P, S, 3.2)
  const price = readable(A, S, 4.6)
  const badgeBg = mix(A, S, dark ? 0.7 : 0.84)
  return {
    dark, bg: S, ink, head, price, P, A,
    headSmall: readable(P, S, 4.6),
    muted: readable(mix(ink, S, 0.36), S, 4.6),
    line: mix(ink, S, 0.8),
    surface: dark ? mix(S, '#FFFFFF', 0.08) : luminance(S) > 0.93 ? mix(S, P, 0.05) : mix(S, '#FFFFFF', 0.65),
    onP: onColour(P), onA: onColour(A),
    badgeBg, badgeInk: readable(dark ? mix(A, '#FFFFFF', 0.5) : mix(A, '#000000', 0.25), badgeBg, 4.6),
    accent3: readable(A, S, 3),
    priceLine: mix(price, S, 0.45),
    crText: contrast(ink, S), crHead: contrast(head, S), crPrice: contrast(price, S),
    headChanged: head !== P, priceChanged: price !== A,
  }
}

/** CSS background for a pattern, in the menu's own colours (kept faint so text stays readable). */
export function bgCss(kind: string, P: string, S: string, A: string) {
  const W = '#FFFFFF', K = '#000000'
  const dark = luminance(S) < 0.2
  const t1 = mix(S, dark ? W : P, dark ? 0.07 : 0.08), t2 = mix(S, A, dark ? 0.18 : 0.14), t3 = mix(S, P, dark ? 0.2 : 0.12)
  const sp = mix(S, dark ? W : K, 0.06)
  switch (kind) {
    case 'paper': return `radial-gradient(${sp} 0.7px, transparent 0.9px) 0 0 / 6px 6px, radial-gradient(${sp} 0.7px, transparent 0.9px) 3px 3px / 6px 6px, ${S}`
    case 'linen': return `repeating-linear-gradient(0deg, ${t1} 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, ${t1} 0 1px, transparent 1px 4px), ${S}`
    case 'kraft': return `radial-gradient(${mix(S, '#5A3A1A', dark ? 0.3 : 0.2)} 0.9px, transparent 1.1px) 0 0 / 7px 7px, radial-gradient(${mix(S, W, 0.25)} 0.9px, transparent 1.1px) 3px 4px / 9px 9px, ${S}`
    case 'grid': return `linear-gradient(${t1} 1px, transparent 1px) 0 0 / 22px 22px, linear-gradient(90deg, ${t1} 1px, transparent 1px) 0 0 / 22px 22px, ${S}`
    case 'pinstripe': return `repeating-linear-gradient(90deg, ${t1} 0 1px, transparent 1px 14px), ${S}`
    case 'polka': return `radial-gradient(${t2} 4px, transparent 4.5px) 0 0 / 28px 28px, radial-gradient(${t2} 4px, transparent 4.5px) 14px 14px / 28px 28px, ${S}`
    case 'diagonal': return `repeating-linear-gradient(45deg, ${t1} 0 8px, transparent 8px 22px), ${S}`
    case 'checker': return `repeating-conic-gradient(${t1} 0 25%, ${S} 0 50%) 0 0 / 36px 36px`
    case 'waves': return `radial-gradient(circle at 50% 0, transparent 9px, ${t3} 9.5px 11px, transparent 11.5px) 0 0 / 24px 14px, ${S}`
    case 'scallop': return `radial-gradient(circle at 50% 100%, ${t1} 0 10px, transparent 10.5px) 0 0 / 22px 22px, ${S}`
    case 'terrazzo': return `radial-gradient(${t2} 2.5px, transparent 3px) 0 0 / 31px 29px, radial-gradient(${t3} 1.8px, transparent 2.2px) 11px 17px / 23px 37px, radial-gradient(${mix(S, A, 0.25)} 1.2px, transparent 1.6px) 19px 6px / 17px 19px, ${S}`
    case 'tiles': return `linear-gradient(${t1} 1.5px, transparent 1.5px) 0 0 / 40px 20px, linear-gradient(90deg, ${t1} 1.5px, transparent 1.5px) 0 0 / 40px 20px, ${S}`
    case 'confetti': return `radial-gradient(${t2} 2px, transparent 2.5px) 0 0 / 26px 31px, radial-gradient(${t3} 2px, transparent 2.5px) 13px 9px / 29px 23px, radial-gradient(${mix(S, A, 0.3)} 1.4px, transparent 1.8px) 7px 19px / 19px 27px, ${S}`
    case 'glow': return `radial-gradient(circle at 0 0, ${mix(S, A, 0.22)}, transparent 55%), radial-gradient(circle at 100% 100%, ${mix(S, P, 0.16)}, transparent 55%), ${S}`
    case 'wood': return `repeating-linear-gradient(90deg, ${mix(S, dark ? W : K, 0.04)} 0 2px, transparent 2px 9px, ${mix(S, dark ? W : K, 0.025)} 9px 10px, transparent 10px 37px), repeating-linear-gradient(0deg, ${mix(S, dark ? W : K, 0.08)} 0 1px, transparent 1px 64px), ${S}`
    case 'chalk': return `radial-gradient(circle at 20% 15%, ${mix(S, dark ? W : P, 0.08)}, transparent 35%), radial-gradient(circle at 80% 60%, ${mix(S, dark ? W : P, 0.07)}, transparent 40%), radial-gradient(circle at 30% 88%, ${mix(S, dark ? W : P, 0.06)}, transparent 35%), ${S}`
    case 'glaze': return `linear-gradient(135deg, ${mix(S, W, 0.7)}, ${S} 40%, ${mix(S, P, 0.05)})`
    case 'lacquer': return `radial-gradient(ellipse at 50% 0, ${mix(S, W, 0.12)}, transparent 60%), radial-gradient(ellipse at 50% 100%, ${mix(S, K, 0.25)}, transparent 60%), ${S}`
    default: return S
  }
}

/** Wood planks for the Board layout's frame. */
export const woodCss = (P: string) => {
  const dk = mix(P, '#000000', 0.28)
  return `repeating-linear-gradient(90deg, ${P} 0 26px, ${dk} 26px 29px, ${mix(P, '#FFFFFF', 0.12)} 29px 52px)`
}

export type Colours = { P: string; S: string; A: string; O: string; O2: string; X: string; Y: string; G: string; ink: string; neon: boolean }

/** A colour key from the artwork ("P", "Od", "#C0392B", "none"…) → a colour. */
export function artColour(k: string, C: Colours) {
  if (!k || k === 'none') return 'none'
  if (k[0] === '#') return k
  if (k === 'W') return '#FFFFFF'
  if (k === 'K') return '#1A1A1A'
  if (k === 'ink') return C.ink
  const base = k.replace(/[dl]$/, '') as keyof Colours
  const c = (C[base] as string) || C.P
  if (k.length > base.length) return k.endsWith('d') ? mix(c, '#000000', 0.28) : mix(c, '#FFFFFF', 0.4)
  return c
}

// ---------- what the menu looks like right now ----------
export type ResolvedLook = {
  style: MenuStyle | null
  frame: MenuFrame | null
  colours: Colours
  theme: MenuTheme
  font: FontSpec
  layout: LayoutId
  bg: string
  night: boolean
}

/** Toronto clock time as minutes after midnight. */
export const torontoMinutes = (now = new Date()) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(now).split(':').map(Number)
  return (h % 24) * 60 + m
}
/** Night mode is on from the owner's time until 5 am. */
export function isNight(from: string | null, now = new Date()) {
  if (!from) return false
  const [h, m] = from.split(':').map(Number)
  const start = h * 60 + m, t = torontoMinutes(now)
  return start > 300 ? t >= start || t < 300 : t >= start && t < 300
}

export function resolveLook(d: MenuDesign, opts: { night?: boolean } = {}): ResolvedLook {
  const style = d.mode === 'style' ? styleById(d.style) : null
  let C: Colours
  if (style) {
    let w = style.ways[d.way] ?? style.ways[0]
    if (opts.night && luminance(w.S) >= 0.2) {
      const darkest = [...style.ways].sort((a, b) => luminance(a.S) - luminance(b.S))[0]
      w = luminance(darkest.S) < 0.2 ? darkest : { ...w, S: mix(w.P, '#0B0B10', 0.88) }
    }
    C = { P: w.P, S: w.S, A: w.A, O: w.O, O2: w.O2, X: w.X ?? w.A, Y: w.Y ?? w.P, G: w.G ?? w.O2, ink: '#1A1A1A', neon: !!w.neon }
  } else {
    const [P, S0, A] = d.colours
    const S = opts.night && luminance(S0) >= 0.2 ? mix(P, '#0B0B10', 0.9) : S0
    C = { P, S, A, O: A, O2: P, X: A, Y: P, G: P, ink: '#1A1A1A', neon: false }
  }
  const theme = buildTheme(C.P, C.S, C.A)
  C.ink = theme.ink
  const frame = style ? null : frameById(d.frame)
  const font = (d.font !== 'style' && pairingFont(d.font)) || style?.font || (frame && pairingFont(frame.font)) || pairingFont('classic')!
  return {
    style, frame, colours: C, theme, font,
    layout: d.layout ?? style?.layout ?? 'classic',
    bg: bgCss(style ? style.bg : d.bg, C.P, C.S, C.A),
    night: !!opts.night,
  }
}

// ---------- seasonal decorations ----------
export type Season = 'christmas' | 'halloween' | 'valentines' | 'lunar' | 'diwali' | 'patio'
// Lunar New Year and Diwali move each year.
const LUNAR: Record<number, string> = { 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03', 2031: '2031-01-23' }
const DIWALI: Record<number, string> = { 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17', 2029: '2029-11-05', 2030: '2030-10-26', 2031: '2031-11-14' }
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000)

/** Which decoration (if any) shows on `day` (YYYY-MM-DD, Toronto). */
export function seasonFor(day: string, d: Pick<MenuDesign, 'seasonal' | 'patio'>): Season | null {
  const y = Number(day.slice(0, 4)), md = day.slice(5)
  if (d.seasonal) {
    if (md >= '12-01' && md <= '12-26') return 'christmas'
    if (md >= '10-15' && md <= '10-31') return 'halloween'
    if (md >= '02-07' && md <= '02-14') return 'valentines'
    if (LUNAR[y]) { const n = dayDiff(day, LUNAR[y]); if (n >= -7 && n <= 10) return 'lunar' }
    if (DIWALI[y]) { const n = dayDiff(day, DIWALI[y]); if (n >= -5 && n <= 2) return 'diwali' }
  }
  if (d.patio && md >= '05-15' && md <= '09-15') return 'patio'
  return null
}
export const SEASON_LABEL: Record<Season, string> = {
  christmas: 'Christmas', halloween: 'Halloween', valentines: 'Valentine’s Day', lunar: 'Lunar New Year', diwali: 'Diwali', patio: 'Patio season',
}

// ---------- dishes ----------
/** Diet labels diners can filter by (same list as the rest of Crumbs). */
export const DIET_FILTERS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal'] as const
/** Owner badges that aren't diets. */
export const BADGES = ['New', 'Popular', 'House favourite', 'Seasonal'] as const

/** 12 → "12", 6.5 → "6.50". */
export const priceLabel = (n: number | null | undefined) =>
  n === null || n === undefined || !isFinite(Number(n)) ? '' : Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2)

// ---------- what the menu shows (built from the restaurant's own data) ----------
export type MenuItemView = {
  id: string
  name: string
  local?: string | null
  description?: string | null
  /** one price per size (null = none for that size) */
  prices: (number | null)[]
  badges?: string[]
  diet?: string[]
  swatch?: string | null
  spice?: number
  pairs?: string | null
  photo?: string | null
  soldOut?: boolean
  /** groups on Crumbs who loved this dish (shown at 3+) */
  loved?: number
}
export type MenuSectionView = { id: string; name: string; local?: string | null; display: SectionDisplay; items: MenuItemView[] }
export type MenuLogo = { img: string | null; text?: string; bg?: string; ink?: string; shape?: 'circle' | 'square' | 'shield' | 'oval' | 'ring' }
export type MenuViewData = {
  name: string
  local?: string | null
  tag?: string | null
  logo: MenuLogo | null
  sections: MenuSectionView[]
  specials?: { title: string; body: string | null }[]
}
