// O15 (Round 95): looks for a restaurant's table menu (/r/<city>/<name>/menu). Each theme sets the
// colours, the heading font and a patterned band across the top. Colours are chosen so text stays
// readable (dark on light or light on dark).

export type MenuTheme = {
  id: string
  label: string
  group: 'Cuisine' | 'Style'
  bg: string
  card: string
  ink: string
  muted: string
  accent: string
  accentInk: string
  /** heading font stack */
  font: string
  /** CSS background for the band across the top */
  band: string
}

const SERIF = 'Georgia, "Times New Roman", serif'
const DIDONE = '"Didot", "Bodoni 72", "Playfair Display", Georgia, serif'
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const ROUND = '"Trebuchet MS", "Avenir Next", system-ui, sans-serif'
const SLAB = '"Rockwell", "Roboto Slab", "Courier New", serif'
const HAND = '"Marker Felt", "Comic Sans MS", "Chalkboard SE", cursive'
const stripes = (a: string, b: string, w = 14) => `repeating-linear-gradient(90deg, ${a} 0 ${w}px, ${b} ${w}px ${w * 2}px)`
const checks = (a: string, b: string, s = 12) => `repeating-conic-gradient(${a} 0 25%, ${b} 0 50%) 0 0 / ${s * 2}px ${s * 2}px`
const dots = (a: string, b: string) => `radial-gradient(circle, ${a} 3px, transparent 3.5px) 0 0 / 14px 14px, ${b}`

export const MENU_THEMES: MenuTheme[] = [
  { id: 'crumbs', label: 'Crumbs', group: 'Style', bg: '#FBF4E8', card: '#FFFFFF', ink: '#1C2A23', muted: '#5F6E65', accent: '#7B2D5B', accentInk: '#FFFFFF', font: SERIF, band: stripes('#7B2D5B', '#E9A23B') },
  // ---- cuisines ----
  { id: 'portuguese', label: 'Portuguese', group: 'Cuisine', bg: '#F5F8FC', card: '#FFFFFF', ink: '#14213D', muted: '#4A5A78', accent: '#1F4E9C', accentInk: '#FFFFFF', font: SERIF, band: `radial-gradient(circle at 50% 50%, #1F4E9C 22%, transparent 23%) 0 0 / 20px 20px, conic-gradient(from 45deg, #FFFFFF 25%, #DDE7F6 0 50%, #FFFFFF 0 75%, #DDE7F6 0) 0 0 / 20px 20px` },
  { id: 'italian', label: 'Italian', group: 'Cuisine', bg: '#FFF9F2', card: '#FFFFFF', ink: '#2A1A14', muted: '#6B5246', accent: '#B3261E', accentInk: '#FFFFFF', font: SERIF, band: checks('#B3261E', '#FFFFFF') },
  { id: 'french', label: 'French bistro', group: 'Cuisine', bg: '#F7F3EA', card: '#FFFDF8', ink: '#1B2340', muted: '#525A75', accent: '#1B2340', accentInk: '#F7F3EA', font: DIDONE, band: stripes('#1B2340', '#F7F3EA', 8) },
  { id: 'english', label: 'English tea room', group: 'Cuisine', bg: '#FAF5EE', card: '#FFFFFF', ink: '#2E1F24', muted: '#6E5A60', accent: '#7A1F3D', accentInk: '#FFFFFF', font: SERIF, band: dots('#7A1F3D', '#F1E3E8') },
  { id: 'japanese', label: 'Japanese', group: 'Cuisine', bg: '#F6F2EA', card: '#FFFFFF', ink: '#1A1A1A', muted: '#5E5A55', accent: '#BC002D', accentInk: '#FFFFFF', font: SERIF, band: `repeating-radial-gradient(circle at 50% 100%, #BC002D 0 2px, #F6F2EA 2px 8px)` },
  { id: 'chinese', label: 'Chinese', group: 'Cuisine', bg: '#7E1416', card: '#9A1C1F', ink: '#FFF4D6', muted: '#F2D8A6', accent: '#E9B949', accentInk: '#3A0A0B', font: SERIF, band: stripes('#E9B949', '#7E1416', 6) },
  { id: 'korean', label: 'Korean', group: 'Cuisine', bg: '#F5F7FA', card: '#FFFFFF', ink: '#1C2333', muted: '#56607A', accent: '#C8102E', accentInk: '#FFFFFF', font: SANS, band: `linear-gradient(90deg, #C8102E 0 50%, #003478 50% 100%)` },
  { id: 'thai', label: 'Thai', group: 'Cuisine', bg: '#FFF8EC', card: '#FFFFFF', ink: '#2B1B0E', muted: '#6C5642', accent: '#8C3B9E', accentInk: '#FFFFFF', font: SERIF, band: stripes('#8C3B9E', '#E2A72E', 10) },
  { id: 'vietnamese', label: 'Vietnamese', group: 'Cuisine', bg: '#F3F7EF', card: '#FFFFFF', ink: '#1E2A1E', muted: '#55654F', accent: '#2F6B3C', accentInk: '#FFFFFF', font: SANS, band: stripes('#2F6B3C', '#E4B43C', 10) },
  { id: 'indian', label: 'Indian', group: 'Cuisine', bg: '#FFF6E8', card: '#FFFFFF', ink: '#2A1608', muted: '#70513A', accent: '#C2410C', accentInk: '#FFFFFF', font: SERIF, band: `repeating-linear-gradient(45deg, #C2410C 0 8px, #0F766E 8px 16px, #F59E0B 16px 24px)` },
  { id: 'mexican', label: 'Mexican', group: 'Cuisine', bg: '#FFF8F0', card: '#FFFFFF', ink: '#2A160E', muted: '#6E5446', accent: '#D6336C', accentInk: '#FFFFFF', font: ROUND, band: `repeating-linear-gradient(90deg, #D6336C 0 20px, #F59F00 20px 40px, #12B886 40px 60px, #228BE6 60px 80px)` },
  { id: 'greek', label: 'Greek', group: 'Cuisine', bg: '#F4F8FC', card: '#FFFFFF', ink: '#0B2545', muted: '#4B6382', accent: '#0D5EAF', accentInk: '#FFFFFF', font: SERIF, band: stripes('#0D5EAF', '#FFFFFF', 9) },
  { id: 'middle-eastern', label: 'Middle Eastern', group: 'Cuisine', bg: '#FBF5EA', card: '#FFFFFF', ink: '#2B2116', muted: '#6E604E', accent: '#0F766E', accentInk: '#FFFFFF', font: SERIF, band: `repeating-conic-gradient(from 45deg, #0F766E 0 25%, #E9D8B4 0 50%) 0 0 / 18px 18px` },
  { id: 'spanish', label: 'Spanish tapas', group: 'Cuisine', bg: '#FFF7EC', card: '#FFFFFF', ink: '#2B160C', muted: '#6F5141', accent: '#AA151B', accentInk: '#FFFFFF', font: SERIF, band: `linear-gradient(#AA151B 0 25%, #F1BF00 25% 75%, #AA151B 75%)` },
  { id: 'caribbean', label: 'Caribbean', group: 'Cuisine', bg: '#F1FAF8', card: '#FFFFFF', ink: '#0E2A2A', muted: '#4A6666', accent: '#0E9F8E', accentInk: '#FFFFFF', font: ROUND, band: stripes('#0E9F8E', '#FF7F50', 12) },
  { id: 'ethiopian', label: 'Ethiopian', group: 'Cuisine', bg: '#FBF6EC', card: '#FFFFFF', ink: '#2A1A0C', muted: '#6E5A44', accent: '#1E7B3A', accentInk: '#FFFFFF', font: SERIF, band: `linear-gradient(#1E7B3A 0 33%, #F5C518 33% 66%, #C8102E 66%)` },
  { id: 'american-diner', label: 'American diner', group: 'Cuisine', bg: '#F2FBFB', card: '#FFFFFF', ink: '#1A1A1A', muted: '#5A5A5A', accent: '#D7263D', accentInk: '#FFFFFF', font: SLAB, band: checks('#1A1A1A', '#FFFFFF', 10) },
  { id: 'german', label: 'German beer hall', group: 'Cuisine', bg: '#F6F1E7', card: '#FFFFFF', ink: '#1F2A44', muted: '#5A627A', accent: '#2D5AA0', accentInk: '#FFFFFF', font: SERIF, band: `repeating-conic-gradient(from 45deg, #2D5AA0 0 25%, #FFFFFF 0 50%) 0 0 / 16px 16px` },
  { id: 'filipino', label: 'Filipino', group: 'Cuisine', bg: '#FFFAF0', card: '#FFFFFF', ink: '#1B1F3B', muted: '#585C7A', accent: '#0038A8', accentInk: '#FFFFFF', font: ROUND, band: `linear-gradient(90deg, #0038A8 0 50%, #CE1126 50%), #FCD116` },
  // ---- styles ----
  { id: 'high-end', label: 'High end', group: 'Style', bg: '#FFFFFF', card: '#FFFFFF', ink: '#111111', muted: '#6B6B6B', accent: '#111111', accentInk: '#FFFFFF', font: DIDONE, band: '#111111' },
  { id: 'black-gold', label: 'Black and gold', group: 'Style', bg: '#0E0E0E', card: '#1A1A1A', ink: '#F4E7C5', muted: '#C9B98F', accent: '#D4AF37', accentInk: '#111111', font: DIDONE, band: 'linear-gradient(90deg, #8C6B1F, #D4AF37, #F4E7C5, #D4AF37, #8C6B1F)' },
  { id: 'pub', label: 'Pub', group: 'Style', bg: '#1E2B22', card: '#27382D', ink: '#F1E9D2', muted: '#C8BC9C', accent: '#C99A3B', accentInk: '#1E2B22', font: SLAB, band: stripes('#5B3A1E', '#3F2814', 18) },
  { id: 'mosaic', label: 'Mosaic', group: 'Style', bg: '#F7F4EE', card: '#FFFFFF', ink: '#1F2A2E', muted: '#5A666A', accent: '#1E6E7E', accentInk: '#FFFFFF', font: SERIF, band: `conic-gradient(#1E6E7E 25%, #E07A5F 0 50%, #F2CC8F 0 75%, #3D405B 0) 0 0 / 16px 16px` },
  { id: 'rustic', label: 'Rustic', group: 'Style', bg: '#EFE4D2', card: '#F8F1E4', ink: '#3A2A1A', muted: '#6E5B45', accent: '#7A4A22', accentInk: '#FFFFFF', font: SLAB, band: stripes('#7A4A22', '#A06A3A', 22) },
  { id: 'minimal', label: 'Minimal', group: 'Style', bg: '#FAFAFA', card: '#FFFFFF', ink: '#161616', muted: '#6E6E6E', accent: '#161616', accentInk: '#FFFFFF', font: SANS, band: '#E6E6E6' },
  { id: 'chalkboard', label: 'Chalkboard', group: 'Style', bg: '#2B312E', card: '#353C38', ink: '#F2F2EC', muted: '#C5C9C2', accent: '#F2D06B', accentInk: '#2B312E', font: HAND, band: 'repeating-linear-gradient(135deg, #3F4642 0 6px, #2B312E 6px 12px)' },
  { id: 'neon', label: 'Neon night', group: 'Style', bg: '#0B0B1E', card: '#16163A', ink: '#F5F3FF', muted: '#C4C1E8', accent: '#FF3EA5', accentInk: '#0B0B1E', font: ROUND, band: 'linear-gradient(90deg, #00E5FF, #FF3EA5, #FFE600)' },
  { id: 'cafe', label: 'Café', group: 'Style', bg: '#F4ECE2', card: '#FFFBF6', ink: '#3B2618', muted: '#755C4A', accent: '#6F4E37', accentInk: '#FFFFFF', font: SERIF, band: dots('#6F4E37', '#E7D6C3') },
  { id: 'seaside', label: 'Seaside', group: 'Style', bg: '#F2F7FB', card: '#FFFFFF', ink: '#0F2B46', muted: '#4D6680', accent: '#0F4C81', accentInk: '#FFFFFF', font: SERIF, band: stripes('#0F4C81', '#FFFFFF', 7) },
  { id: 'garden', label: 'Garden', group: 'Style', bg: '#F1F6EC', card: '#FFFFFF', ink: '#1F2E1A', muted: '#55664D', accent: '#3E7C3A', accentInk: '#FFFFFF', font: SERIF, band: dots('#3E7C3A', '#DCEBD3') },
  { id: 'vintage', label: 'Vintage', group: 'Style', bg: '#F3E9D7', card: '#FBF4E6', ink: '#3A2B1D', muted: '#6F5D48', accent: '#8B3A2B', accentInk: '#FFFFFF', font: DIDONE, band: stripes('#8B3A2B', '#D9B98B', 5) },
  { id: 'bold', label: 'Bold', group: 'Style', bg: '#FFE14D', card: '#FFFFFF', ink: '#111111', muted: '#3F3F3F', accent: '#111111', accentInk: '#FFE14D', font: SLAB, band: checks('#111111', '#FFE14D', 9) },
  { id: 'pastel', label: 'Pastel bakery', group: 'Style', bg: '#FFF5F8', card: '#FFFFFF', ink: '#3A2430', muted: '#7A5D6B', accent: '#C2577F', accentInk: '#FFFFFF', font: ROUND, band: stripes('#F7C6D9', '#CDEBE0', 12) },
]

export const menuTheme = (id?: string | null) =>
  MENU_THEMES.find((t) => t.id === id) ?? MENU_THEMES[0]

/** The CSS variables the table menu page uses for a theme. */
export function themeStyle(theme: MenuTheme): Record<string, string> {
  return {
    '--background': theme.bg,
    '--foreground': theme.ink,
    '--card': theme.card,
    '--card-foreground': theme.ink,
    '--muted': theme.card,
    '--muted-foreground': theme.muted,
    '--border': theme.muted + '55',
    '--primary': theme.accent,
    '--primary-foreground': theme.accentInk,
    '--menu-font': theme.font,
    background: theme.bg,
    color: theme.ink,
  }
}

/** WCAG contrast ratio between two #rrggbb colours (for the tests: every theme stays readable). */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    )
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
