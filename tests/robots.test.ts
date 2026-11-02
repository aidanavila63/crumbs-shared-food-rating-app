import { test } from 'node:test'
import assert from 'node:assert/strict'
import { robotsAllows } from '../lib/robots.ts'

test('no rules or an empty Disallow allows everything', () => {
  assert.equal(robotsAllows('', '/menu'), true)
  assert.equal(robotsAllows('User-agent: *\nDisallow:', '/menu'), true)
})

test('the * group applies when Crumbs is not named', () => {
  const txt = 'User-agent: *\nDisallow: /admin\nDisallow: /private/*.pdf$'
  assert.equal(robotsAllows(txt, '/admin/x'), false)
  assert.equal(robotsAllows(txt, '/menu'), true)
  assert.equal(robotsAllows(txt, '/private/menu.pdf'), false)
  assert.equal(robotsAllows(txt, '/private/menu.pdf?x=1'), true)
})

test('a group naming Crumbs wins over *, and the longest rule wins', () => {
  const txt = [
    'User-agent: Googlebot',
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: CrumbsMenuReader # thanks',
    'Disallow: /',
    'Allow: /menu',
  ].join('\n')
  assert.equal(robotsAllows(txt, '/menu/dinner'), true)
  assert.equal(robotsAllows(txt, '/about'), false)
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/'), false)
  // Same length: Allow wins.
  assert.equal(robotsAllows('User-agent: *\nDisallow: /menu\nAllow: /menu', '/menu'), true)
})
