import test from 'node:test'
import assert from 'node:assert/strict'

import { makeUsagePanel } from '../lib/panel.js'
import { normalizeReport } from '../lib/api.js'

const payload = {
  start_date: '2026-10-14',
  end_date: '2026-11-12',
  data: [
    { date: '2026-11-01', model: 'deepseek-v4-flash', total_tokens: 900, api_requests: 2, credits: 0.3 },
    { date: '2026-11-02', model: 'glm5.3-flash', total_tokens: 300, api_requests: 1, credits: 0.6 },
  ],
  totals: {
    total_tokens: 2_200,
    api_requests: 5,
    credits: 0.9,
    by_model: [
      { model: 'deepseek-v4-flash', total_tokens: 1_900, api_requests: 4, credits: 0.6 },
      { model: 'glm5.3-flash', total_tokens: 300, api_requests: 1, credits: 0.3 },
    ],
  },
  all_time: { total_tokens: 10_000, api_requests: 42, cached_at: '2026-11-12T09:38:11Z' },
  credits: {
    period_start: '2026-10-26T05:29:21Z',
    period_end: '2026-11-26T05:29:21Z',
    allowance: 7_000,
    used: 733.7,
    remaining: 6_266.3,
    pack_credits: 0,
    frozen: false,
  },
}

let React
let TestRenderer
try {
  React = (await import('react')).default
  const rendererModule = await import('react-test-renderer')
  TestRenderer = rendererModule.default
} catch {
  React = undefined
  TestRenderer = undefined
}

const ui = {
  Box: 'box',
  Text: 'text',
  Divider: 'divider',
  ScrollBox: 'scrollbox',
  useAnimationTime: () => 0,
}

function flatten(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join(' ')
  return flatten(node.children)
}

async function renderPanel({ sourceResult, width = 44 }) {
  const Panel = makeUsagePanel({
    source: { load: async () => sourceResult },
    config: { windowDays: 30, autoRefreshSeconds: 0, lowCreditsPercent: 10 },
  })
  const renderer = TestRenderer.create(
    React.createElement(Panel, {
      React,
      ui,
      host: { onKey: () => () => {}, notify() {}, clearBadge() {}, focused: true, visible: true },
      width,
      height: 40,
      focused: true,
      visible: true,
    }),
  )
  // The panel fetches on mount; give the microtask/effect chain time to settle.
  for (let i = 0; i < 5; i += 1) await new Promise(resolve => setTimeout(resolve, 5))
  return flatten(renderer.toJSON())
}

test('panel renders credits, window, models and all-time totals', { skip: TestRenderer === undefined }, async () => {
  const text = await renderPanel({ sourceResult: { ok: true, report: normalizeReport(payload) } })
  assert.match(text, /NaN usage/)
  assert.match(text, /733\.7 \/ 7,000 credits/)
  assert.match(text, /6,266\.3 left/)
  assert.match(text, /10\.5%/)
  assert.match(text, /2\.2k tokens · 5 requests/)
  assert.match(text, /deepseek-v4-flash/)
  assert.match(text, /10k tokens · 42 requests/)
})

test('panel narrows without crashing and keeps the credit summary', { skip: TestRenderer === undefined }, async () => {
  const text = await renderPanel({ sourceResult: { ok: true, report: normalizeReport(payload) }, width: 30 })
  assert.match(text, /NaN usage/)
  assert.match(text, /733\.7 \/ 7,000 credits/)
})

test('panel renders a readable error when the query fails', { skip: TestRenderer === undefined }, async () => {
  const text = await renderPanel({ sourceResult: { ok: false, reason: 'no-key' } })
  assert.match(text, /No API key/)
  assert.match(text, /Press r to retry/)
})
