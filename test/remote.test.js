import test from 'node:test'
import assert from 'node:assert/strict'

import { createUsageHandler, NAN_RPC_PATH, registerUsageRoute } from '../lib/remote.js'

const payload = {
  start_date: '2026-10-14',
  end_date: '2026-11-12',
  data: [],
  totals: { total_tokens: 100, api_requests: 2, credits: 1, by_model: [] },
  credits: { allowance: 7000, used: 700, remaining: 6300, period_start: '2026-10-26T00:00:00Z', period_end: '2026-11-26T00:00:00Z', pack_credits: 0, frozen: false },
}

const route = { provider: 'nan', baseUrl: 'https://api.nan.builders/v1', apiKeyEnv: 'NAN_API_KEY' }

function handler(overrides = {}) {
  return createUsageHandler({
    resolveRoute: () => route,
    resolveKey: async () => 'sk-test',
    fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }),
    ...overrides,
  })
}

test('usage route answers with the normalized report', async () => {
  const response = await handler()(new Request('http://x/', { method: 'POST', body: '{}' }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.report.credits.remaining, 6300)
  assert.equal(body.report.totals.apiRequests, 2)
})

test('usage route reports a missing provider without calling the network', async () => {
  let called = false
  const response = await handler({
    resolveRoute: () => undefined,
    fetchImpl: async () => {
      called = true
      return new Response('{}', { status: 200 })
    },
  })(new Request('http://x/', { method: 'POST' }))
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.equal(body.error, 'no-provider')
  assert.match(body.message, /nan-setup/)
  assert.equal(called, false)
})

test('usage route maps upstream failures to a message', async () => {
  const response = await handler({
    fetchImpl: async () => new Response('{}', { status: 401 }),
  })(new Request('http://x/', { method: 'POST' }))
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.equal(body.error, 'unauthorized')
  assert.match(body.message, /rejected/)
})

test('registerUsageRoute is a no-op without a Connection service', () => {
  const ctx = { get: () => undefined }
  assert.equal(registerUsageRoute(ctx, () => new Response('')), undefined)
})

test('registerUsageRoute registers the exact path and returns the disposer', () => {
  const calls = []
  const ctx = {
    get(name) {
      if (name !== 'connection') return undefined
      return { fetch: { register: options => { calls.push(options); return () => calls.push('disposed') } } }
    },
  }
  const dispose = registerUsageRoute(ctx, () => new Response('{}'))
  assert.equal(typeof dispose, 'function')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, NAN_RPC_PATH)
  assert.deepEqual(calls[0].methods, ['POST'])
  assert.equal(calls[0].requestBody, 'buffered')
})
