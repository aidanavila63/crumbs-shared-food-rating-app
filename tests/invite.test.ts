import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanCode, invitePath, isJoinCode } from '../lib/invite.ts'

test('invite codes: member (6) and guest (7) codes, tidied', () => {
  assert.equal(isJoinCode('ABC234'), true)
  assert.equal(isJoinCode('ABCD234'), true) // guest codes are 7
  assert.equal(isJoinCode('abc'), false)
  assert.equal(isJoinCode('ABC-23'), false)
  assert.equal(cleanCode(' abc234 '), 'ABC234')
  assert.equal(invitePath('abc234'), '/invite/ABC234')
})
