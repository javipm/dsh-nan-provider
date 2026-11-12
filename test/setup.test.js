import test from 'node:test'
import assert from 'node:assert/strict'

import { NAN_MODELS } from '../lib/catalog.js'
import { buildProviderProfile, describeNanSetup, isNonChatModel, mergeModels, runNanSetup } from '../lib/setup.js'

function harness({
  providers = {},
  key = 'sk-test',
  conflictOnce = false,
  modelIds = ['glm5.3', 'brand-new-chat', 'qwen3-embedding', 'rerank'],
  fetchStatus = 200,
  dialogKey,
} = {}) {
  const state = {
    providers: { ...providers },
    revision: 1,
    mutations: 0,
    saved: undefined,
    stored: undefined,
    conflict: conflictOnce,
    fetchedWith: undefined,
  }
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
        const path = op.path
        assert.equal(path[0], 'providers')
        if (path.length === 2) state.providers[path[1]] = op.value
        else if (path.length === 3) state.providers[path[1]][path[2]] = op.value
        else throw new Error(`unexpected path ${path.join('.')}`)
      }
      state.mutations += 1
      state.revision += 1
    },
  }
  const credentials = {
    resolve: async ref => (ref === 'OPENAI_API_KEY' && key !== '' ? { value: key } : undefined),
    set: async (ref, value) => {
      state.stored = { ref, value }
    },
  }
  const agentDefaultModel = {
    saveSelection: async selection => {
      state.saved = selection
    },
  }
  const dialogs = {
    input: async (_ctx, request) => {
      state.promptTitle = request?.title
      return dialogKey
    },
  }
  const fetchImpl = async (url, init) => {
    state.fetchedWith = { url: String(url), auth: init?.headers?.authorization }
    return new Response(JSON.stringify({ data: modelIds.map(id => ({ id })) }), {
      status: fetchStatus,
      headers: { 'content-type': 'application/json' },
    })
  }
  const ctx = {
    get(name) {
      if (name === 'settings') return settings
      if (name === 'credentials') return credentials
      if (name === 'agentDefaultModel') return agentDefaultModel
      if (name === 'tuiDialogs') return dialogs
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
  fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
}

test('mergeModels unions catalog + live ids and filters non-chat models', () => {
  const { models, added } = mergeModels(['glm5.3', 'brand-new-chat', 'qwen3-embedding', 'rerank'])
  assert.equal(models.length, NAN_MODELS.length + 1)
  assert.deepEqual(added, ['brand-new-chat'])
  const addedModel = models.find(model => model.id === 'brand-new-chat')
  assert.equal(addedModel.contextWindow, 1_048_576)
  assert.deepEqual(addedModel.input, ['text'])
  for (const id of ['text-embedding-3-large', 'kokoro', 'flux-2-klein', 'qwen-image-2.1', 'whisper', 'minimax-h3']) {
    assert.equal(isNonChatModel(id), true, id)
  }
  assert.equal(isNonChatModel('qwen3.8-flash'), false)
})

test('setup creates the provider, stores the key and refreshes the models', async () => {
  const { ctx, state } = harness()
  const mergedConfig = { ...config }
  const result = await runNanSetup(ctx, { ...mergedConfig, fetchImpl: async (url, init) => {
    state.fetchedWith = { url: String(url), auth: init?.headers?.authorization }
    return new Response(JSON.stringify({ data: [{ id: 'glm5.3' }, { id: 'brand-new-chat' }, { id: 'qwen3-embedding' }] }), { status: 200 })
  } })

  assert.equal(result.ok, true)
  assert.equal(result.created, true)
  assert.equal(result.keyConfigured, true)
  assert.equal(result.defaultSet, true)
  assert.deepEqual(result.added, ['brand-new-chat'])
  assert.equal(result.modelCount, NAN_MODELS.length + 1)

  const written = state.providers.nan
  assert.equal(written.displayName, 'NaN')
  assert.equal(written.baseURL, 'https://api.nan.builders/v1')
  assert.equal(written.apiKeyEnv, 'OPENAI_API_KEY')
  assert.equal(written.models.length, NAN_MODELS.length + 1)
  assert.deepEqual(state.saved, { provider: 'nan', model: 'deepseek-v4-flash', reasoningEffort: 'max' })
  assert.match(describeNanSetup(result), /Provider nan: created/)
  assert.match(describeNanSetup(result), /1 new: brand-new-chat/)
})

test('setup refreshes an existing provider without touching the other fields', async () => {
  const existing = { displayName: 'My NaN', baseURL: 'https://api.nan.builders/v1', apiKeyEnv: 'OPENAI_API_KEY', models: NAN_MODELS.slice(0, 2) }
  const { ctx, state } = harness({ providers: { nan: existing } })
  const result = await runNanSetup(ctx, { ...config, fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'glm5.3' }] }), { status: 200 }) })

  assert.equal(result.ok, true)
  assert.equal(result.created, false)
  assert.equal(state.mutations, 1)
  assert.equal(state.providers.nan.displayName, 'My NaN')
  assert.ok(state.providers.nan.models.length >= NAN_MODELS.length)
  assert.match(describeNanSetup(result), /Provider nan: refreshed/)
})

test('setup asks for the key and stores it when missing', async () => {
  const { ctx, state } = harness({ key: '', dialogKey: ' sk-typed ' })
  const result = await runNanSetup(ctx, { ...config, fetchImpl: async (url, init) => {
    state.fetchedWith = { url: String(url), auth: init?.headers?.authorization }
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  } })

  assert.equal(result.ok, true)
  assert.equal(result.keyConfigured, true)
  assert.equal(result.keyStored, true)
  assert.deepEqual(state.stored, { ref: 'OPENAI_API_KEY', value: 'sk-typed' })
  assert.equal(state.fetchedWith.auth, 'Bearer sk-typed')
  assert.match(state.promptTitle, /visible while typing/)
})

test('setup reports a missing key and skips the model refresh', async () => {
  const { ctx, state } = harness({ key: '', dialogKey: undefined })
  const result = await runNanSetup(ctx, config)

  assert.equal(result.ok, true)
  assert.equal(result.keyConfigured, false)
  assert.equal(state.fetchedWith, undefined)
  assert.match(describeNanSetup(result), /MISSING/)
})

test('setup keeps the catalog when the model endpoint fails', async () => {
  const { ctx } = harness({ fetchStatus: 401 })
  const result = await runNanSetup(ctx, config)

  assert.equal(result.ok, true)
  assert.equal(result.fetchFailed, true)
  assert.equal(result.modelCount, NAN_MODELS.length)
  assert.match(describeNanSetup(result), /Model refresh failed/)
})

test('setup retries once on a settings conflict', async () => {
  const { ctx, state } = harness({ conflictOnce: true })
  const result = await runNanSetup(ctx, config)
  assert.equal(result.ok, true)
  assert.equal(state.mutations, 1)
})

test('buildProviderProfile carries the whole catalog and retry policy', () => {
  const profile = buildProviderProfile(config)
  assert.equal(profile.api, 'openai-completions')
  assert.equal(profile.models.length, 11)
  assert.ok(profile.models.some(model => model.id === 'glm5.3'))
  assert.equal(profile.retryPolicy.maxRetries, 5)
})
