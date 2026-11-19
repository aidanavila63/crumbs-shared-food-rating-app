// O15 v2 (Round 99): fonts for the table menu, self-hosted by Next (no request to Google from diners).
// Only the two the menu uses are downloaded (preload off). Japanese and Korean headings use the phone's own fonts.
// Import this file only from menu screens so the rest of the app doesn't carry it.
import { Abril_Fatface, Abyssinica_SIL, Alegreya, Alegreya_SC, Alfa_Slab_One, Amiri, Archivo_Black, Baloo_2, Be_Vietnam_Pro, Bebas_Neue, Bungee, Caveat, Cinzel, Cormorant_Garamond, Courier_Prime, DM_Sans, Figtree, Fraunces, Fredoka, Josefin_Sans, Karla, Kaushan_Script, Lilita_One, Lora, Marcellus, Mitr, Oswald, Pacifico, Permanent_Marker, Playfair_Display, Poiret_One, Righteous, Rye, Space_Grotesk, Special_Elite, UnifrakturMaguntia, Yatra_One } from 'next/font/google'

const playfair = Playfair_Display({ weight: ['400', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const cormorant = Cormorant_Garamond({ weight: ['500', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const fraunces = Fraunces({ weight: ['400', '600', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const abril = Abril_Fatface({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const marcellus = Marcellus({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const alegreyasc = Alegreya_SC({ weight: ['400', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const alegreya = Alegreya({ weight: ['400', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const mitr = Mitr({ weight: ['400', '600'], subsets: ['latin', 'thai'], display: 'swap', preload: false })
const bevietnam = Be_Vietnam_Pro({ weight: ['400', '600', '700'], subsets: ['latin', 'vietnamese'], display: 'swap', preload: false })
const yatra = Yatra_One({ weight: ['400'], subsets: ['latin', 'devanagari'], display: 'swap', preload: false })
const lilita = Lilita_One({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const amiri = Amiri({ weight: ['400', '700'], subsets: ['latin', 'arabic'], display: 'swap', preload: false })
const righteous = Righteous({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const abyssinica = Abyssinica_SIL({ weight: ['400'], subsets: ['latin', 'ethiopic'], display: 'swap', preload: false })
const baloo = Baloo_2({ weight: ['400', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const bebas = Bebas_Neue({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const josefin = Josefin_Sans({ weight: ['400', '600', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const cinzel = Cinzel({ weight: ['400', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const archivo = Archivo_Black({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const oswald = Oswald({ weight: ['400', '600'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const caveat = Caveat({ weight: ['500', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const pacifico = Pacifico({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const fredoka = Fredoka({ weight: ['400', '600'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const dmsans = DM_Sans({ weight: ['400', '600', '700', '800'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const lora = Lora({ weight: ['400', '600', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const karla = Karla({ weight: ['400', '600', '700', '800'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const figtree = Figtree({ weight: ['400', '600', '700', '800'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const rye = Rye({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const bungee = Bungee({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const alfaslab = Alfa_Slab_One({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const space = Space_Grotesk({ weight: ['500', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const marker = Permanent_Marker({ weight: ['400'], subsets: ['latin'], display: 'swap', preload: false })
const poiret = Poiret_One({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const elite = Special_Elite({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const courier = Courier_Prime({ weight: ['400', '700'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const kaushan = Kaushan_Script({ weight: ['400'], subsets: ['latin', 'latin-ext'], display: 'swap', preload: false })
const fraktur = UnifrakturMaguntia({ weight: ['400'], subsets: ['latin'], display: 'swap', preload: false })

const stack = (f: { style: { fontFamily: string } }, fallback: string) => `${f.style.fontFamily}, ${fallback}`

/** Font key (as used in lib/menu-design.ts) → CSS font-family. */
export const MENU_FONTS: Record<string, string> = {
  playfair: stack(playfair, "Georgia, serif"),
  cormorant: stack(cormorant, "Georgia, serif"),
  fraunces: stack(fraunces, "Georgia, serif"),
  abril: stack(abril, "Georgia, serif"),
  marcellus: stack(marcellus, "Georgia, serif"),
  alegreyasc: stack(alegreyasc, "Georgia, serif"),
  alegreya: stack(alegreya, "Georgia, serif"),
  mitr: stack(mitr, "system-ui, sans-serif"),
  bevietnam: stack(bevietnam, "system-ui, sans-serif"),
  yatra: stack(yatra, "Georgia, serif"),
  lilita: stack(lilita, "system-ui, sans-serif"),
  amiri: stack(amiri, "Georgia, serif"),
  righteous: stack(righteous, "system-ui, sans-serif"),
  abyssinica: stack(abyssinica, "Georgia, serif"),
  baloo: stack(baloo, "system-ui, sans-serif"),
  bebas: stack(bebas, "Impact, sans-serif"),
  josefin: stack(josefin, "system-ui, sans-serif"),
  cinzel: stack(cinzel, "Georgia, serif"),
  archivo: stack(archivo, "Impact, sans-serif"),
  oswald: stack(oswald, "Impact, sans-serif"),
  caveat: stack(caveat, "'Marker Felt', cursive"),
  pacifico: stack(pacifico, "cursive"),
  fredoka: stack(fredoka, "system-ui, sans-serif"),
  dmsans: stack(dmsans, "system-ui, sans-serif"),
  lora: stack(lora, "Georgia, serif"),
  karla: stack(karla, "system-ui, sans-serif"),
  figtree: stack(figtree, "system-ui, sans-serif"),
  rye: stack(rye, "Georgia, serif"),
  bungee: stack(bungee, "Impact, sans-serif"),
  alfaslab: stack(alfaslab, "Georgia, serif"),
  space: stack(space, "system-ui, sans-serif"),
  marker: stack(marker, "'Marker Felt', cursive"),
  poiret: stack(poiret, "system-ui, sans-serif"),
  elite: stack(elite, "'Courier New', monospace"),
  courier: stack(courier, "'Courier New', monospace"),
  kaushan: stack(kaushan, "cursive"),
  fraktur: stack(fraktur, "'Old English Text MT', serif"),
  shippori: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Noto Serif CJK JP', Georgia, serif",
  blackhan: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif",
}
export const MONO = MENU_FONTS.courier
export const menuFont = (key: string) => MENU_FONTS[key] ?? MENU_FONTS.lora
