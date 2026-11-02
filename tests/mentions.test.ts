import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findMentions, mentionParts } from '../lib/mentions.ts'

const names = { a: 'Maya Lee', b: 'Jordan', c: 'Sam' }

test('finds @first-name mentions, not yourself or emails', () => {
  assert.deepEqual(findMentions('@maya you have to try this, @Jordan!', names, 'c'), ['a', 'b'])
  assert.deepEqual(findMentions('mail sam@example.com', names), [])
  assert.deepEqual(findMentions('@Sam ok', names, 'c'), [])
})

test('splits text into mention parts', () => {
  assert.deepEqual(mentionParts('hey @Maya look', names), [
    { text: 'hey ', mention: false },
    { text: '@Maya', mention: true },
    { text: ' look', mention: false },
  ])
})
