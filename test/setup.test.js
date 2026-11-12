import test from 'node:test'
import assert from 'node:assert/strict'

import { NAN_MODELS } from '../lib/catalog.js'
import { buildProviderProfile, describeNanSetup, runNanSetup } from '../lib/setup.js'

function harness({ providers = {}, key = 'sk-test', conflictOnce = false } = {}) {
  const state = { providers: { ...providers }, revision: 1, mutations: 0, saved: undefined, conflict: conflictOnce }
  const settings = {
    describe: () => [{ ns: 'llm-pi-ai', revision: state.revision, value: { providers: state.providers } }],
    mutate: async (ns, ops, revision) => {
      assert.equal(ns, 'llm-pi-ai')
      if (state.conflict) {
        state.conflict = false
        const error = new Error('conflict')
        error.code = 'SETTINGS_CONFLICT'
        throw error
      }
      assert.equal(revision, state.revision)
      for (const op of ops) {
        assert.equal(op.op, 'set')
        const [root, id] = op.path
        assert.equal(root, 'providers')
        state.providers[id] = op.value
      }
      state.mutations += 1
      state.revision += 1
    },
  }
  const credentials = {
    resolve: async ref => (ref === 'OPENAI_API_KEY' && key !== '' ? { value: key } : undefined),
  }
  const agentDefaultModel = {
    saveSelection: async selection => {
      state.saved = selection
    },
  }
  const ctx = {
    get(name) {
      if (name === 'settings') return settings
      if (name === 'credentials') return credentials
      if (name === 'agentDefaultModel') return agentDefaultModel
      return undefined
    },
  }
  return { ctx, state }
}

const config = {
  provider: 'nan',
  baseUrl: 'https://api.nan.builders/v1',
  apiKeyEnv: 'OPENAI_API_KEY',
  setupModel: 'deepseek-v4-flash',
  setupEffort: 'max',
}

test('setup creates the provider, checks the key and sets the default model', async () => {
  const { ctx, state } = harness()
  const result = await runNanSetup(ctx, config)

  assert.equal(result.ok, true)
  assert.equal(result.created, true)
  assert.equal(result.keyConfigured, true)
  assert.equal(result.defaultSet, true)

  const written = state.providers.nan
  assert.equal(written.displayName, 'NaN')
  assert.equal(written.baseURL, 'https://api.nan.builders/v1')
  assert.equal(written.apiKeyEnv, 'OPENAI_API_KEY')
  assert.equal(written.models.length, NAN_MODELS.length)
  assert.deepEqual(state.saved, { provider: 'nan', model: 'deepseek-v4-flash', reasoningEffort: 'max' })
  assert.match(describeNanSetup(result), /Provider nan: created/)
  assert.match(describeNanSetup(result), /Default model: nan\/deepseek-v4-flash · max/)
})

test('setup is idempotent and leaves an existing provider untouched', async () => {
  const existing = { displayName: 'My NaN', baseURL: 'https://api.nan.builders/v1', apiKeyEnv: 'OPENAI_API_KEY' }
  const { ctx, state } = harness({ providers: { nan: existing } })
  const result = await runNanSetup(ctx, config)

  assert.equal(result.ok, true)
  assert.equal(result.created, false)
  assert.equal(state.mutations, 0)
  assert.equal(state.providers.nan, existing)
  assert.match(describeNanSetup(result), /already present \(left untouched\)/)
})

test('setup reports a missing key without failing the provider write', async () => {
  const { ctx } = harness({ key: '' })
  const result = await runNanSetup(ctx, config)
  assert.equal(result.ok, true)
  assert.equal(result.keyConfigured, false)
  assert.match(describeNanSetup(result), /MISSING/)
})

test('setup retries once on a settings conflict', async () => {
  const { ctx, state } = harness({ conflictOnce: true })
  const result = await runNanSetup(ctx, config)
  assert.equal(result.ok, true)
  assert.equal(state.mutations, 1)
})

test('buildProviderProfile carries the whole catalog', () => {
  const profile = buildProviderProfile(config)
  assert.equal(profile.api, 'openai-completions')
  assert.equal(profile.models.length, 11)
  assert.ok(profile.models.some(model => model.id === 'glm5.3'))
  assert.equal(profile.retryPolicy.maxRetries, 5)
})
