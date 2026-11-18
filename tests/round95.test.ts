import test from 'node:test'
import assert from 'node:assert/strict'
import { MENU_THEMES, contrast, menuTheme, themeStyle } from '../lib/menu-themes.ts'
import { money } from '../lib/currency.ts'
import { duplicateCandidates, nameKey } from '../lib/merge.ts'

test('every table-menu theme keeps text readable', () => {
  assert.ok(MENU_THEMES.length >= 30)
  assert.equal(new Set(MENU_THEMES.map((t) => t.id)).size, MENU_THEMES.length)
  for (const t of MENU_THEMES) {
    assert.match(t.id, /^[a-z0-9-]{2,30}$/)
    assert.ok(contrast(t.ink, t.card) >= 4.5, `${t.id}: text on cards`)
    assert.ok(contrast(t.ink, t.bg) >= 4.5, `${t.id}: text on the page`)
    assert.ok(contrast(t.muted, t.card) >= 3, `${t.id}: small grey text`)
    assert.ok(contrast(t.accentInk, t.accent) >= 3, `${t.id}: button text`)
  }
  assert.equal(menuTheme('nope').id, 'crumbs')
  assert.equal(themeStyle(menuTheme('black-gold'))['--card'], '#1A1A1A')
  assert.ok(MENU_THEMES.some((t) => t.id === 'portuguese') && MENU_THEMES.some((t) => t.id === 'mosaic'))
})

test('trip money in its own currency', () => {
  assert.match(money(1234.5, 'EUR'), /1,?234[.,]50/)
  assert.match(money(1234.5, 'EUR'), /€/)
  assert.match(money(30, null), /\$30/)
  assert.match(money(3000, 'JPY'), /3,?000/)
  assert.match(money(12, 'bad'), /\$12/)
})

test('merge: likely copies first', () => {
  assert.equal(nameKey('The Hana Ramen!'), 'hanaramen')
  assert.equal(nameKey('Café Crème'), 'creme')
  const p = (id: string, name: string, lat: number | null = null, restaurant_id: string | null = null) =>
    ({ id, group_id: 'g', name, latitude: lat, longitude: lat === null ? null : -79.4, restaurant_id, formatted_address: null, status: 'Been' }) as any
  const here = p('a', 'Hana Ramen', 43.65)
  const list = duplicateCandidates(here, [here, p('b', 'Zed Bar'), p('c', 'hana ramen (queen st)'), p('d', 'Other', 43.6501), p('e', 'Apple')])
  assert.deepEqual(list.map((x) => [x.place.id, x.likely]), [['c', true], ['d', true], ['e', false], ['b', false]])
  assert.deepEqual(duplicateCandidates(here, [here, p('b', 'Zed Bar')], 'zed').map((x) => x.place.id), ['b'])
})
