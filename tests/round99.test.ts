import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STYLES, LAYOUT_IDS, EFFECT_IDS, BG_IDS, PAIRINGS, buildTheme, contrast, normalizeDesign, normalizeDisplay, legacyLook,
  resolveLook, seasonFor, isNight, priceLabel, bgCss, DEFAULT_DESIGN, readable, artColour,
} from '../lib/menu-design.ts'
import { STYLE_ART, SEASON_ART } from '../lib/menu-art.ts'

test('every ready-made style has artwork and three readable colourways', () => {
  assert.equal(STYLES.length, 30)
  assert.equal(new Set(STYLES.map((s) => s.id)).size, STYLES.length)
  for (const s of STYLES) {
    assert.ok(STYLE_ART[s.id]?.top || STYLE_ART[s.id]?.behind, `${s.id}: artwork`)
    assert.ok(STYLE_ART[s.id].div, `${s.id}: divider`)
    assert.equal(s.ways.length, 3, `${s.id}: three colourways`)
    assert.ok(LAYOUT_IDS.includes(s.layout), `${s.id}: layout`)
    for (const w of s.ways) {
      const t = buildTheme(w.P, w.S, w.A)
      assert.ok(contrast(t.ink, w.S) >= 7, `${s.id}/${w.name}: dish names`)
      assert.ok(contrast(t.muted, w.S) >= 4.5, `${s.id}/${w.name}: descriptions`)
      assert.ok(contrast(t.price, w.S) >= 4.5, `${s.id}/${w.name}: prices`)
      assert.ok(contrast(t.head, w.S) >= 3, `${s.id}/${w.name}: headings`)
      assert.ok(contrast(t.onP, w.P) >= 3, `${s.id}/${w.name}: text on primary`)
      assert.ok(contrast(t.badgeInk, t.badgeBg) >= 4.5, `${s.id}/${w.name}: badges`)
    }
  }
  for (const p of Object.values(STYLE_ART).flatMap((a) => [a.top, a.div, a.corner, a.behind]).filter(Boolean))
    for (const path of p!.p) assert.match(path.d, /^M/)
  assert.deepEqual(Object.keys(SEASON_ART).sort(), ['christmas', 'diwali', 'halloween', 'lunar', 'patio', 'valentines'])
})

test('any colours the owner picks stay readable', () => {
  const picks = ['#FFFF00', '#FFFFFF', '#000000', '#7B2D5B', '#00FF7F', '#FF69B4', '#808080', '#1A1A1A', '#F2C14E', '#0E7C86']
  for (const P of picks) for (const S of picks) for (const A of picks) {
    const t = buildTheme(P, S, A)
    // the best any text can do on this background (mid grey can't reach 7:1 with anything)
    const best = Math.max(contrast('#000000', S), contrast('#FFFFFF', S)) * 0.9
    assert.ok(contrast(t.ink, S) >= Math.min(7, best), `ink ${P} ${S} ${A}`)
    assert.ok(contrast(t.price, S) >= Math.min(4.5, best), `price ${P} ${S} ${A}`)
    assert.ok(contrast(t.muted, S) >= Math.min(4.5, best), `muted ${P} ${S} ${A}`)
  }
  assert.equal(readable('#FFFF00', '#FFFFFF', 4.5) !== '#FFFF00', true)
  assert.equal(readable('#111111', '#FFFFFF', 4.5), '#111111')
})

test('stored designs are cleaned up and old looks carry over', () => {
  assert.deepEqual(normalizeDesign(null, null).mode, 'custom')
  assert.equal(normalizeDesign(null, 'italian').style, 'trattoria')
  assert.equal(normalizeDesign(null, 'black-gold').style, 'deco')
  assert.equal(normalizeDesign(null, 'chalkboard').layout, 'board')
  const d = normalizeDesign({ v: 2, mode: 'style', style: 'nope', way: 7, bg: 'x', colours: ['#abc', 'red', null], font: 'zzz', layout: 'grid', logo: 'x', night: '25:00', seasonal: false })
  assert.equal(d.style, DEFAULT_DESIGN.style)
  assert.equal(d.way, 0)
  assert.equal(d.bg, 'paper')
  assert.deepEqual(d.colours, ['#AABBCC', DEFAULT_DESIGN.colours[1], DEFAULT_DESIGN.colours[2]])
  assert.equal(d.font, 'style')
  assert.equal(d.layout, null)
  assert.equal(d.logo, 'top')
  assert.equal(d.night, null)
  assert.equal(d.seasonal, false)
  assert.equal(normalizeDesign({ v: 2, night: '21:30' }).night, '21:30')
  // every old Round 95 look id still gives a real design
  for (const id of ['crumbs', 'portuguese', 'italian', 'french', 'english', 'japanese', 'chinese', 'korean', 'thai', 'vietnamese', 'indian', 'mexican', 'greek',
    'middle-eastern', 'spanish', 'caribbean', 'ethiopian', 'american-diner', 'german', 'filipino', 'high-end', 'black-gold', 'pub', 'mosaic', 'rustic', 'minimal',
    'chalkboard', 'neon', 'cafe', 'seaside', 'garden', 'vintage', 'bold', 'pastel']) {
    const l = legacyLook(id)
    assert.ok(l.mode === 'custom' || STYLES.some((s) => s.id === l.style), id)
  }
})

test('category display settings', () => {
  assert.deepEqual(normalizeDisplay(null), { effect: 'list', sizes: [], show_prices: true, note: '', label: '' })
  const d = normalizeDisplay({ effect: 'sizes', sizes: ['10"', ' 14" ', '', '18"', 'XL', 'XXL'], show_prices: false, note: 'x'.repeat(200) })
  assert.equal(d.effect, 'sizes')
  assert.deepEqual(d.sizes, ['10"', '14"', '18"', 'XL'])
  assert.equal(d.show_prices, false)
  assert.equal(d.note.length, 120)
  assert.equal(normalizeDisplay({ effect: 'teleport' }).effect, 'list')
  assert.equal(EFFECT_IDS.length, 13)
})

test('every look, layout and background resolves', () => {
  for (const s of STYLES) for (const way of [0, 1, 2]) for (const night of [false, true]) {
    const l = resolveLook({ ...DEFAULT_DESIGN, mode: 'style', style: s.id, way }, { night })
    assert.ok(l.theme.ink && l.bg)
    if (night) assert.ok(l.theme.dark, `${s.id} night is dark`)
  }
  for (const bg of BG_IDS) assert.ok(bgCss(bg, '#7B2D5B', '#FBF4E8', '#E9A23B').includes('#'))
  for (const p of PAIRINGS) assert.equal(resolveLook({ ...DEFAULT_DESIGN, font: p[0] }).font.hf, p[2])
  assert.equal(resolveLook({ ...DEFAULT_DESIGN, mode: 'custom' }).layout, 'classic')
  assert.equal(resolveLook({ ...DEFAULT_DESIGN, mode: 'style', style: 'lantern' }).layout, 'poster')
  const C = resolveLook({ ...DEFAULT_DESIGN, mode: 'style', style: 'pizzeria' }).colours
  assert.equal(artColour('X', C), '#F57C00')
  assert.equal(artColour('none', C), 'none')
  assert.match(artColour('Pd', C), /^#[0-9A-F]{6}$/)
})

test('seasons, night mode and prices', () => {
  const on = { seasonal: true, patio: true }
  assert.equal(seasonFor('2026-12-20', on), 'christmas')
  assert.equal(seasonFor('2026-12-27', on), null)
  assert.equal(seasonFor('2026-10-31', on), 'halloween')
  assert.equal(seasonFor('2027-02-10', on), 'valentines')
  assert.equal(seasonFor('2027-02-04', on), 'lunar')
  assert.equal(seasonFor('2026-11-06', on), 'diwali')
  assert.equal(seasonFor('2026-07-01', on), 'patio')
  assert.equal(seasonFor('2026-07-01', { seasonal: true, patio: false }), null)
  assert.equal(seasonFor('2026-12-20', { seasonal: false, patio: true }), null)
  // Toronto is UTC-5 in winter: 02:30 UTC = 21:30 Toronto
  assert.equal(isNight('21:00', new Date('2026-12-02T02:30:00Z')), true)
  assert.equal(isNight('21:00', new Date('2026-12-02T09:30:00Z')), true) // 4:30 am
  assert.equal(isNight('21:00', new Date('2026-12-02T15:00:00Z')), false) // 10 am
  assert.equal(isNight(null), false)
  assert.equal(priceLabel(12), '12')
  assert.equal(priceLabel(6.5), '6.50')
  assert.equal(priceLabel(null), '')
})

test('full-page designs', async () => {
  const { FRAMES } = await import('../lib/menu-art.ts')
  assert.ok(FRAMES.length >= 15)
  assert.equal(new Set(FRAMES.map((f) => f.id)).size, FRAMES.length)
  for (const f of FRAMES) {
    assert.ok(f.label && f.note && f.pad > 0, f.id)
    assert.ok(PAIRINGS.some((p) => p[0] === f.font), `${f.id}: font`)
    const t = buildTheme(f.scheme[0], f.scheme[1], f.scheme[2])
    assert.ok(contrast(t.ink, f.scheme[1]) >= 7, `${f.id}: its colours read well`)
    for (const piece of [f.corner, f.crest, f.div, f.top, f.bottom, f.side, f.mids].filter(Boolean))
      for (const p of piece!.p) assert.match(p.d, /^M/, f.id)
    assert.ok(f.rules.length || f.side, `${f.id}: has lines or a side illustration`)
  }
  assert.equal(normalizeDesign({ v: 2, frame: 'flourish' }).frame, 'flourish')
  assert.equal(normalizeDesign({ v: 2, frame: 'nope' }).frame, null)
  assert.equal(resolveLook({ ...DEFAULT_DESIGN, frame: 'botanical' }).font.hf, 'poiret')
  assert.equal(resolveLook({ ...DEFAULT_DESIGN, frame: 'botanical', font: 'classic' }).font.hf, 'playfair')
  assert.equal(resolveLook({ ...DEFAULT_DESIGN, mode: 'style', style: 'pub', frame: 'botanical' }).frame, null)
})

test('the table menu is filled from the app: categories, sold out, specials, menus and times', async () => {
  const { buildTableMenu, mealAt, menuNames } = await import('../lib/table-menu-data.ts')
  const dish = (name: string, price: number | null, course: string | null, more: Record<string, unknown> = {}) =>
    ({ name, price, course, dietary: [], description: null, ...more })
  const src = {
    name: 'Nonna',
    cuisine: 'Italian',
    menu: [
      dish('Margherita', 14, 'main'),
      dish('Diavola', 16, 'main', { dietary: ['Vegetarian', 'Spicy?'] }),
      dish('Carbonara', 19, 'main'),
      dish('Tiramisu', 9, 'dessert'),
      dish('Bread', 4, null),
      dish('Eggs Benedict', 15, 'main', { served: ['breakfast'] }),
      dish('Negroni', 13, 'drink', { menu_name: 'Drinks' }),
      dish('Old pizza', 10, 'main'),
    ],
    menu_sections: [
      { id: 'pizza', name: 'Pizza', name_local: 'Pizze', menu_name: null, display: { effect: 'sizes', sizes: ['10"', '14"'] } },
      { id: 'pasta', name: 'Pasta', name_local: null, menu_name: null, display: { effect: 'list' } },
      { id: 'empty', name: 'Salads', name_local: null, menu_name: null, display: null },
    ],
    menu_items: [
      { id: 'd1', name: 'Margherita', section: 'pizza', position: 1, prices: [14, 19], sold_out_on: null, badges: ['Popular'], swatch: null, name_local: null, spice: null, pairs_with: null, photo_path: null },
      { id: 'd2', name: 'Diavola', section: 'pizza', position: 0, prices: null, sold_out_on: '2026-11-18', badges: null, swatch: null, name_local: null, spice: 2, pairs_with: 'Chianti', photo_path: null },
      { id: 'd3', name: 'Carbonara', section: 'pasta', position: null, prices: null, sold_out_on: '2026-11-17', badges: null, swatch: null, name_local: 'Carbonara alla romana', spice: null, pairs_with: null, photo_path: null },
      { id: 'd8', name: 'Old pizza', section: 'deleted-category', position: null, prices: null, sold_out_on: null, badges: null, swatch: null, name_local: null, spice: null, pairs_with: null, photo_path: null },
    ],
    posts: [{ title: 'Truffle week', body: 'Shaved at the table' }],
    top_dishes: [{ name: 'margherita', groups: 4 }],
  }
  const built = buildTableMenu(src, { today: '2026-11-18', meal: 'dinner', logo: 'https://x/logo.png' })
  const names = built.data.sections.map((s) => s.name)
  // owner's categories first in their order (empty ones skipped), then courses, then dishes whose category is gone
  assert.deepEqual(names, ['Pizza', 'Pasta', 'Desserts', 'More', 'More'])
  const pizza = built.data.sections[0]
  assert.equal(pizza.local, 'Pizze')
  assert.equal(pizza.display.effect, 'sizes')
  assert.deepEqual(pizza.items.map((i) => i.name), ['Diavola', 'Margherita'])
  assert.deepEqual(pizza.items[1].prices, [14, 19])
  assert.equal(pizza.items[1].loved, 4)
  assert.deepEqual(pizza.items[1].badges, ['Popular'])
  // sold out only counts for today
  assert.equal(pizza.items[0].soldOut, true)
  assert.equal(built.data.sections[1].items[0].soldOut, false)
  assert.equal(pizza.items[0].spice, 2)
  assert.equal(pizza.items[0].pairs, 'Chianti')
  // only known diet labels reach the filter
  assert.deepEqual(pizza.items[0].diet, ['Vegetarian'])
  assert.deepEqual(built.diets, ['Vegetarian'])
  assert.equal(built.hasLocal, true)
  // pasta has no sizes: the pizza category's settings don't leak into it
  assert.equal(built.data.sections[1].display.effect, 'list')
  assert.deepEqual(built.data.sections[1].display.sizes, [])
  // breakfast-only dish is left out at dinner, and counted
  assert.equal(built.notNow, 1)
  assert.ok(!built.data.sections.flatMap((s) => s.items).some((i) => i.name === 'Eggs Benedict'))
  assert.equal(buildTableMenu(src, { today: '2026-11-18', meal: null }).notNow, 0)
  // the Drinks menu is its own menu
  assert.deepEqual(menuNames(src), ['', 'Drinks'])
  const drinks = buildTableMenu(src, { today: '2026-11-18', menu: 'Drinks' })
  assert.deepEqual(drinks.data.sections.flatMap((s) => s.items.map((i) => i.name)), ['Negroni'])
  assert.equal(drinks.data.tag, 'Italian · Drinks')
  assert.deepEqual(built.data.specials, [{ title: 'Truffle week', body: 'Shaved at the table' }])
  assert.deepEqual(built.data.logo, { img: 'https://x/logo.png' })
  // meal times (Toronto minutes)
  assert.equal(mealAt(6 * 60), 'breakfast')
  assert.equal(mealAt(12 * 60), 'lunch')
  assert.equal(mealAt(19 * 60), 'dinner')
  assert.equal(mealAt(23 * 60), 'late')
  assert.equal(mealAt(2 * 60), 'late')
})
