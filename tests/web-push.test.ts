import test from 'node:test'
import assert from 'node:assert/strict'
import { webpush } from '../lib/web-push.ts'

// Round 85: whichever web-push version is installed (3 or 4), the functions the notify and daily
// routes use are there, and a VAPID setup with real keys is accepted.
test('web-push loads the same way on version 3 and 4', () => {
  assert.equal(typeof webpush.setVapidDetails, 'function')
  assert.equal(typeof webpush.sendNotification, 'function')
  const keys = webpush.generateVAPIDKeys()
  assert.doesNotThrow(() =>
    webpush.setVapidDetails('mailto:crumbs.foodapp@gmail.com', keys.publicKey, keys.privateKey),
  )
})
