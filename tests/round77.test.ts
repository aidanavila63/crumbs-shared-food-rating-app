import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanSiteUrl } from '../lib/site.ts'
import { jobIsLate } from '../lib/jobs-shared.ts'
import { hasSession } from '../lib/session-cookie.ts'
import { invitePath } from '../lib/invite.ts'
import { listedKeys } from '../lib/r2-list.ts'
import { heirs } from '../lib/heirs.ts'

test('the site address setting is tidied, junk ignored', () => {
  assert.equal(cleanSiteUrl('crumbs.example.com/'), 'https://crumbs.example.com')
  assert.equal(cleanSiteUrl(' https://crumbs.example.com/path '), 'https://crumbs.example.com')
  assert.equal(cleanSiteUrl(''), null)
  assert.equal(cleanSiteUrl('not a url at all'), null)
})

test('a scheduled job is overdue after its allowance', () => {
  const now = Date.parse('2026-11-16T12:00:00Z')
  assert.equal(jobIsLate('daily', '2026-11-15T12:00:00Z', now), false)
  assert.equal(jobIsLate('daily', '2026-11-14T12:00:00Z', now), true)
  assert.equal(jobIsLate('backup', '2026-11-09T12:00:00Z', now), false)
  assert.equal(jobIsLate('backup', null, now), true)
  assert.equal(jobIsLate('something-else', null, now), false)
})

test('signed-out visitors are told apart by the sign-in cookie only', () => {
  assert.equal(hasSession(['sb-abcd-auth-token']), true)
  assert.equal(hasSession(['sb-abcd-auth-token.0', 'sb-abcd-auth-token.1']), true)
  assert.equal(hasSession(['crumbs-theme', 'sb-abcd-auth-token-code-verifier']), false)
  assert.equal(hasSession([]), false)
})

test('invite paths are unchanged', () => {
  assert.equal(invitePath(' abc234 '), '/invite/ABC234')
})

test('the off-site backup list is read from the R2 answer', () => {
  const xml = '<ListBucketResult><Contents><Key>crumbs-2026-11-09.json.gz</Key></Contents><Contents><Key>crumbs-2026-11-16.json.gz</Key></Contents></ListBucketResult>'
  assert.deepEqual(listedKeys(xml), ['crumbs-2026-11-09.json.gz', 'crumbs-2026-11-16.json.gz'])
})

test('when the owner leaves, admins come first and guests never take over', () => {
  const members = [
    { id: 'o', display_name: 'O', avatar_url: null, role: 'owner' as const },
    { id: 'g', display_name: 'G', avatar_url: null, role: 'guest' as const },
    { id: 'm', display_name: 'M', avatar_url: null, role: 'member' as const },
    { id: 'a', display_name: 'A', avatar_url: null, role: 'admin' as const },
  ]
  assert.deepEqual(heirs(members, 'o').map((m) => m.id), ['a', 'm'])
})
