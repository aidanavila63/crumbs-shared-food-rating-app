import test from 'node:test'
import assert from 'node:assert/strict'
import { gate, gateResponse, whoIsAsking } from '../lib/server-gate.ts'

const client = (opts: {
  claims?: any
  claimsError?: any
  user?: any
  rpc?: any
  letIn?: boolean
}) => ({
  auth: {
    getClaims: async () => ({
      data: opts.claims ? { claims: opts.claims } : null,
      error: opts.claimsError ?? null,
    }),
    getUser: async () => ({ data: { user: opts.user ?? null } }),
  },
  rpc: async (name: string) =>
    name === 'request_gate' ? opts.rpc : { data: opts.letIn ?? false, error: null },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  }),
})

test('the gate answer: signed out 401, not let in 403, switch off 403 with its message', async () => {
  assert.equal(gateResponse(null)!.status, 401)
  assert.equal(gateResponse({ signed_in: false })!.status, 401)
  assert.equal(gateResponse({ signed_in: true, let_in: false })!.status, 403)
  const off = gateResponse(
    { signed_in: true, let_in: true, flag_ok: false },
    'AI ideas are switched off for now',
  )!
  assert.equal(off.status, 403)
  assert.equal((await off.json()).error, 'AI ideas are switched off for now')
  assert.equal(gateResponse({ signed_in: true, let_in: true, flag_ok: true }), null)
})

test('who is asking: the verified token first, the sign-in server if that fails', async () => {
  assert.equal(await whoIsAsking(client({ claims: { sub: 'u1' } })), 'u1')
  assert.equal(
    await whoIsAsking(client({ claimsError: { message: 'x' }, user: { id: 'u2' } })),
    'u2',
  )
  assert.equal(await whoIsAsking(client({})), null)
})

test('one call answers the gate; an old database falls back to the separate checks', async () => {
  const ok = await gate(
    client({
      claims: { sub: 'u1' },
      rpc: { data: { signed_in: true, let_in: true, flag_ok: true }, error: null },
    }),
  )
  assert.deepEqual(ok, { userId: 'u1' })
  const stopped = await gate(
    client({
      claims: { sub: 'u1' },
      rpc: { data: { signed_in: true, let_in: false }, error: null },
    }),
  )
  assert.equal('response' in stopped && stopped.response.status, 403)
  const old = await gate(
    client({
      claims: { sub: 'u1' },
      rpc: { data: null, error: { code: 'PGRST202' } },
      letIn: true,
    }),
  )
  assert.deepEqual(old, { userId: 'u1' })
  const hiccup = await gate(
    client({ claims: { sub: 'u1' }, rpc: { data: null, error: { code: '57014' } } }),
  )
  assert.equal('response' in hiccup && hiccup.response.status, 403)
  const out = await gate(client({}))
  assert.equal('response' in out && out.response.status, 401)
})
