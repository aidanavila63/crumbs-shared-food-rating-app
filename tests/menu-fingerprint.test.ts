import { test } from 'node:test'
import assert from 'node:assert/strict'
import { menuFingerprint, siteKey } from '../lib/menu-fingerprint.ts'

test('same menu, different spacing and capitals: same fingerprint', () => {
  const a = 'Butter Chicken  $18.50\nSamosa $6'
  const b = 'butter chicken $18.50  samosa   $6\n\n'
  assert.equal(menuFingerprint(a), menuFingerprint(b))
})

test('a changed price or dish changes the fingerprint', () => {
  const base = menuFingerprint('Butter Chicken $18.50 Samosa $6')
  assert.notEqual(base, menuFingerprint('Butter Chicken $19.50 Samosa $6'))
  assert.notEqual(base, menuFingerprint('Butter Chicken $18.50 Samosa $6 Naan $4'))
})

test('site keys ignore scheme, www and trailing slash', () => {
  assert.equal(siteKey('https://www.TableNine.example/'), 'tablenine.example')
  assert.equal(siteKey('http://tablenine.example'), 'tablenine.example')
  assert.equal(siteKey('https://tablenine.example/menu/'), 'tablenine.example/menu')
  assert.equal(siteKey('not a url/'), 'not a url')
})
