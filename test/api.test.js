import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchModels, fetchUsage, normalizeReport, resolveApiKey, usageWindow } from '../lib/api.js'

const payload = {
  object: 'usage.report',
  start_date: '2026-10-14',
  end_date: '2026-11-12',
  data: [
    {
      date: '2026-11-01',
      model: 'deepseek-v4-flash',
      prompt_tokens: 1_000,
      cached_tokens: 400,
      completion_tokens: 100,
      total_tokens: 1_100,
      api_requests: 3,
      credits: 0.4,
    },
  ],
  totals: {
    prompt_tokens: 2_000,
    cached_tokens: 500,
    completion_tokens: 200,
    total_tokens: 2_200,
    api_requests: 5,
    credits: 0.9,
    by_model: [
      {
        model: 'deepseek-v4-flash',
        prompt_tokens: 2_000,
        cached_tokens: 500,
        completion_tokens: 200,
        total_tokens: 2_200,
        api_requests: 5,
        credits: 0.9,
      },
    ],
  },
  all_time: {
    prompt_tokens: 9_000,
    completion_tokens: 1_000,
    total_tokens: 10_000,
    api_requests: 42,
    cached_at: '2026-11-12T09:38:11Z',
  },
  has_more: false,
  next_cursor: null,
  credits: {
    period_start: '2026-10-26T05:29:21Z',
    period_end: '2026-11-26T05:29:21Z',
    allowance: 7_000,
    used: 733.7,
    remaining: 6_266.3,
    pack_credits: 0,
    pack_expires_at: null,
    frozen: false,
  },
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

test('usageWindow is inclusive and capped at 90 days', () => {
  const now = new Date('2026-11-12T11:00:00Z')
  assert.deepEqual(usageWindow(30, now), { start: '2026-10-14', end: '2026-11-12', days: 30 })
  assert.equal(usageWindow(200, now).days, 90)
  assert.equal(usageWindow(0, now).days, 1)
  assert.equal(usageWindow(Number.NaN, now).days, 30)
})

test('fetchUsage sends the key and window and normalizes the report', async () => {
  let seen
  const result = await fetchUsage({
    apiKey: 'sk-test',
    baseUrl: 'https://api.example.test/v1/',
    startDate: '2026-10-14',
    endDate: '2026-11-12',
    fetchImpl: async (url, init) => {
      seen = { url: String(url), init }
      return jsonResponse(payload)
    },
  })

  assert.equal(result.ok, true)
  assert.match(seen.url, /^https:\/\/api\.example\.test\/v1\/usage\?/)
  assert.match(seen.url, /start_date=2026-10-14/)
  assert.match(seen.url, /end_date=2026-11-12/)
  assert.equal(seen.init.headers.authorization, 'Bearer sk-test')

  const { report } = result
  assert.equal(report.windowDays, 30)
  assert.equal(report.credits.remaining, 6_266.3)
  assert.equal(report.totals.byModel[0].model, 'deepseek-v4-flash')
  assert.equal(report.allTime.cachedAt, '2026-11-12T09:38:11Z')
  assert.equal(report.rows[0].cachedTokens, 400)
})

test('fetchUsage maps auth, rate limit, http and invalid responses', async () => {
  const unauthorized = await fetchUsage({ apiKey: 'sk-test', fetchImpl: async () => jsonResponse({}, { status: 401 }) })
  assert.deepEqual(unauthorized, { ok: false, reason: 'unauthorized', status: 401 })

  const limited = await fetchUsage({
    apiKey: 'sk-test',
    fetchImpl: async () => jsonResponse({}, { status: 429, headers: { 'retry-after': '7' } }),
  })
  assert.equal(limited.ok, false)
  assert.equal(limited.reason, 'rate-limit')
  assert.equal(limited.retryAfter, 7)

  const http = await fetchUsage({ apiKey: 'sk-test', fetchImpl: async () => jsonResponse({}, { status: 503 }) })
  assert.deepEqual(http, { ok: false, reason: 'http', status: 503 })

  const invalid = await fetchUsage({
    apiKey: 'sk-test',
    fetchImpl: async () => new Response('not json', { status: 200 }),
  })
  assert.deepEqual(invalid, { ok: false, reason: 'invalid' })

  const network = await fetchUsage({
    apiKey: 'sk-test',
    fetchImpl: async () => {
      throw new Error('boom')
    },
  })
  assert.deepEqual(network, { ok: false, reason: 'network' })
})

test('fetchUsage never calls the network without a key', async () => {
  let called = false
  const result = await fetchUsage({
    apiKey: '',
    fetchImpl: async () => {
      called = true
      return jsonResponse(payload)
    },
  })
  assert.deepEqual(result, { ok: false, reason: 'no-key' })
  assert.equal(called, false)
})

test('normalizeReport refuses a payload without credits or totals', () => {
  assert.equal(normalizeReport({ start_date: '2026-11-01', end_date: '2026-11-12' }), undefined)
  assert.equal(normalizeReport(null), undefined)
  assert.equal(normalizeReport([]), undefined)
})

test('resolveApiKey prefers the credential store and falls back to the environment', async () => {
  const ctx = {
    get(name) {
      if (name !== 'credentials') return undefined
      return { resolve: async ref => (ref === 'NAN_API_KEY' ? { value: 'sk-from-store' } : undefined) }
    },
  }
  assert.equal(await resolveApiKey(ctx, 'NAN_API_KEY'), 'sk-from-store')

  const broken = { get: () => ({ resolve: async () => { throw new Error('no store') } }) }
  const previous = process.env.NAN_USAGE_TEST_KEY
  process.env.NAN_USAGE_TEST_KEY = 'sk-from-env'
  try {
    assert.equal(await resolveApiKey(broken, 'NAN_USAGE_TEST_KEY'), 'sk-from-env')
  } finally {
    if (previous === undefined) delete process.env.NAN_USAGE_TEST_KEY
    else process.env.NAN_USAGE_TEST_KEY = previous
  }

  assert.equal(await resolveApiKey({ get: () => undefined }, 'NAN_USAGE_TEST_KEY'), '')
})

test('fetchModels lists ids from both payload shapes', async () => {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), auth: init?.headers?.authorization })
    return jsonResponse({ data: [{ id: 'glm5.3' }, { id: 'brand-new' }, { id: '' }, { nope: true }] })
  }
  const result = await fetchModels({ apiKey: 'sk-test', baseUrl: 'https://api.example.test/v1', fetchImpl })
  assert.deepEqual(result, { ok: true, ids: ['glm5.3', 'brand-new'] })
  assert.match(seen[0].url, /\/v1\/models$/)
  assert.equal(seen[0].auth, 'Bearer sk-test')

  const arrayShape = await fetchModels({
    apiKey: 'sk-test',
    fetchImpl: async () => jsonResponse([{ id: 'one' }, { id: 'two' }]),
  })
  assert.deepEqual(arrayShape, { ok: true, ids: ['one', 'two'] })
})

test('fetchModels maps failures', async () => {
  assert.deepEqual(await fetchModels({ apiKey: '' }), { ok: false, reason: 'no-key' })
  assert.deepEqual(await fetchModels({ apiKey: 'sk', fetchImpl: async () => jsonResponse({}, { status: 401 }) }), {
    ok: false,
    reason: 'unauthorized',
    status: 401,
  })
  assert.deepEqual(await fetchModels({ apiKey: 'sk', fetchImpl: async () => jsonResponse({}, { status: 500 }) }), {
    ok: false,
    reason: 'http',
    status: 500,
  })
  assert.deepEqual(await fetchModels({ apiKey: 'sk', fetchImpl: async () => jsonResponse({ data: [] }) }), {
    ok: false,
    reason: 'invalid',
  })
})
