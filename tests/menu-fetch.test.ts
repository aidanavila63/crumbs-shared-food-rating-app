import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateAddress, findMenuLinks, htmlToText } from '../lib/menu-fetch.ts'

test('blocks private and local addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1'])
    assert.equal(isPrivateAddress(ip), true, ip)
  for (const ip of ['8.8.8.8', '151.101.1.1']) assert.equal(isPrivateAddress(ip), false, ip)
})

test('finds same-site menu links and skips PDFs', () => {
  const html =
    '<a href="/menu">Our Menu</a><a href="/files/menu.pdf">PDF menu</a><a href="https://other.com/menu">x</a><a href="/about">About</a>'
  assert.deepEqual(findMenuLinks(html, 'https://example.com/'), ['https://example.com/menu'])
})

test('strips scripts and tags', () => {
  assert.equal(htmlToText('<script>x()</script><h1>Soup</h1><p>$8</p>'), 'Soup\n $8')
})
