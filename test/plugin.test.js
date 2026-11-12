import test from 'node:test'
import assert from 'node:assert/strict'

import { apply } from '../lib/index.js'

const reportPayload = {
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
  all_time: { total_tokens: 10_000, api_requests: 42, cached_at: '2026-11-12T09:38:11Z' },
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

function fakeFetch() {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(reportPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { calls, fetchImpl }
}

function mount({ withPanels = true, withCommands = true, apiKey = 'sk-test', fetchImpl } = {}) {
  const captured = { panels: [], commands: [], opened: [], effects: [] }
  const panels = withPanels
    ? {
        register(descriptor) {
          captured.panels.push(descriptor)
          return () => {}
        },
        list() {
          return [{ id: 'nan-usage:usage', title: 'NaN usage', source: 'plugin' }]
        },
        open(id) {
          captured.opened.push(id)
          return true
        },
      }
    : undefined
  const commands = withCommands
    ? {
        register(definition) {
          captured.commands.push(definition)
          return () => {}
        },
      }
    : undefined
  const ctx = {
    get(name) {
      if (name === 'tuiPanels') return panels
      if (name === 'commands') return commands
      if (name === 'credentials') return { resolve: async () => ({ value: apiKey }) }
      return undefined
    },
    inject(deps, callback) {
      const ready = deps.every(name => this.get(name) !== undefined)
      if (ready) callback(this)
      return { dispose() {} }
    },
    effect(factory) {
      const dispose = factory()
      captured.effects.push(dispose)
      return dispose
    },
    logger: { warn() {} },
  }

  apply(ctx, { fetchImpl })
  return captured
}

test('apply registers the sidebar panel and the usage command', () => {
  const captured = mount()
  assert.equal(captured.panels.length, 1)
  const [panel] = captured.panels
  assert.equal(panel.apiVersion, 1)
  assert.equal(panel.id, 'usage')
  assert.equal(panel.title, 'NaN usage')
  assert.equal(panel.icon, '◈')
  assert.equal(typeof panel.component, 'function')

  assert.equal(captured.commands.length, 1)
  assert.equal(captured.commands[0].name, 'usage')
  assert.equal(captured.commands[0].recordInput, false)
})

test('/usage opens the panel without spending a request', async () => {
  const captured = mount()
  const outcome = await captured.commands[0].handler({ rawInput: '' })
  assert.deepEqual(captured.opened, ['nan-usage:usage'])
  assert.deepEqual(outcome, { kind: 'success', text: '' })
})

test('/usage text returns the compact report', async () => {
  const { fetchImpl, calls } = fakeFetch()
  const captured = mount({ fetchImpl })
  const outcome = await captured.commands[0].handler({ rawInput: 'text' })

  assert.equal(outcome.kind, 'success')
  assert.match(outcome.text, /NaN usage · 733\.7\/7,000 credits used/)
  assert.match(outcome.text, /Last 30 days: 2\.2k tokens · 5 requests · 0\.9 credits/)
  assert.match(outcome.text, /deepseek-v4-flash/)
  assert.match(outcome.text, /All time: 10k tokens · 42 requests/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-test')
})

test('without panels, /usage falls back to the text report', async () => {
  const { fetchImpl } = fakeFetch()
  const captured = mount({ withPanels: false, fetchImpl })
  const outcome = await captured.commands[0].handler({ rawInput: '' })
  assert.equal(outcome.kind, 'success')
  assert.match(outcome.text, /NaN usage/)
})

test('a missing API key becomes a readable command error', async () => {
  const captured = mount({ withPanels: false, apiKey: '' })
  const outcome = await captured.commands[0].handler({ rawInput: 'text' })
  assert.equal(outcome.kind, 'error')
  assert.match(outcome.text, /No API key/)
})
