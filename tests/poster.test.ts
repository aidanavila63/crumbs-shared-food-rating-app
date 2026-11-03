import test from 'node:test'
import assert from 'node:assert/strict'
import { wrapLines, groupPoster, crumbsPoster } from '../lib/poster.ts'

// 10 px per letter keeps the maths easy to read.
const measure = (text: string) => text.length * 10

test('short text stays on one line', () => {
  assert.deepEqual(wrapLines(measure, 'Maya & Jordan', 200), { lines: ['Maya & Jordan'], fits: true })
})

test('long text wraps by words onto a second line', () => {
  const { lines, fits } = wrapLines(measure, 'The Saturday Ramen Club', 150, 2)
  assert.deepEqual(lines, ['The Saturday', 'Ramen Club'])
  assert.equal(fits, true)
})

test('reports when it needs more lines than allowed', () => {
  const { lines, fits } = wrapLines(measure, 'one two three four five six', 70, 2)
  assert.ok(lines.length > 2)
  assert.equal(fits, false)
})

test('a single word that is too wide reports no fit', () => {
  const { lines, fits } = wrapLines(measure, 'Supercalifragilistic', 100, 2)
  assert.deepEqual(lines, ['Supercalifragilistic'])
  assert.equal(fits, false)
})

test('empty text gives one empty line', () => {
  assert.deepEqual(wrapLines(measure, '   ', 100), { lines: [''], fits: true })
})

test('group poster says who it is for and shows the code', () => {
  const spec = groupPoster({ name: 'Foood', emoji: '🍱', color: null, join_code: 'ABC234' }, 'https://x.test/invite/ABC234')
  assert.equal(spec.title, 'Foood')
  assert.equal(spec.badge, '🍱')
  assert.match(spec.sub ?? '', /ABC234/)
  assert.equal(spec.link, 'https://x.test/invite/ABC234')
})

test('group poster falls back to a plate emoji', () => {
  const spec = groupPoster({ name: 'Us', emoji: null, color: null, join_code: 'ZZZ999' }, 'https://x.test/invite/ZZZ999')
  assert.equal(spec.badge, '🍽️')
})

test('crumbs poster leads to the link it is given and has no badge', () => {
  const spec = crumbsPoster('https://x.test/')
  assert.equal(spec.title, 'Join Crumbs')
  assert.equal(spec.link, 'https://x.test/')
  assert.equal(spec.badge, undefined)
})
