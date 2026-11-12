import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  parseSharedProfile,
  readSharedProfile,
  sharedProfileDiff,
  sharedProfilePath,
  syncSharedProfile,
  writeSharedProfile,
} from '../lib/shared.js'

const shared = {
  provider: 'nan',
  baseUrl: 'https://api.nan.builders/v1',
  apiKeyEnv: 'NAN_API_KEY',
  models: [
    { id: 'deepseek-v4-flash', contextWindow: 1_048_575, maxTokens: 32_768 },
    { id: 'glm5.3', contextWindow: 1_048_576, maxTokens: 32_768 },
    { id: 'brand-new', contextWindow: 128_000, maxTokens: 4_096 },
  ],
}

function tempFile() {
  const dir = mkdtempSync(join(tmpdir(), 'nan-shared-'))
  return { dir, file: join(dir, 'nan-provider.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function settingsCtx(providers, { revision = 1 } = {}) {
  const state = { providers: structuredClone(providers), revision, ops: undefined, conflict: false }
  const settings = {
    describe: () => [{ ns: 'llm-pi-ai', revision: state.revision, value: { providers: state.providers } }],
    mutate: async (ns, ops, rev) => {
      assert.equal(ns, 'llm-pi-ai')
      assert.equal(rev, state.revision)
      if (state.conflict) {
        state.conflict = false
        const error = new Error('conflict')
        error.code = 'SETTINGS_CONFLICT'
        throw error
      }
      state.ops = ops
      for (const op of ops) {
        if (op.path.length === 2) state.providers[op.path[1]] = op.value
        else state.providers[op.path[1]][op.path[2]] = op.value
      }
      state.revision += 1
    },
  }
  return {
    state,
    ctx: {
      get(name) {
        return name === 'settings' ? settings : undefined
      },
    },
  }
}

test('writeSharedProfile round-trips and reads back', () => {
  const { file, cleanup } = tempFile()
  try {
    assert.equal(writeSharedProfile(shared, file), true)
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(parsed.version, 1)
    assert.ok(typeof parsed.updatedAt === 'string')
    assert.deepEqual(readSharedProfile(file), shared)
  } finally {
    cleanup()
  }
})

test('readSharedProfile tolerates missing or malformed files', () => {
  const { file, cleanup } = tempFile()
  try {
    assert.equal(readSharedProfile(file), undefined)
    writeFileSync(file, 'not json')
    assert.equal(readSharedProfile(file), undefined)
    writeFileSync(file, JSON.stringify({ provider: 'nan' }))
    assert.equal(readSharedProfile(file), undefined)
    assert.equal(parseSharedProfile(null), undefined)
    assert.equal(parseSharedProfile({ ...shared, models: [] }), undefined)
  } finally {
    cleanup()
  }
})

test('sharedProfilePath lives under DSH_HOME', () => {
  assert.match(sharedProfilePath(), /(\.dsh|\/)[^/]*nan-provider\.json$/)
})

test('sharedProfileDiff detects a missing provider', () => {
  const diff = sharedProfileDiff({}, shared)
  assert.equal(diff.created, true)
  assert.equal(diff.models.length, 3)

  const diffAway = sharedProfileDiff({ other: {} }, shared)
  assert.equal(diffAway.created, true)
})

test('sharedProfileDiff reports new models and changed sizes', () => {
  const diff = sharedProfileDiff(
    { nan: { baseURL: shared.baseUrl, apiKeyEnv: shared.apiKeyEnv, models: [{ id: 'glm5.3', contextWindow: 1_048_576, maxTokens: 32_768 }] } },
    shared,
  )
  assert.equal(diff.created, false)
  assert.deepEqual(diff.addedModels, ['deepseek-v4-flash', 'brand-new'])
  assert.equal(diff.models.length, 3)
})

test('sharedProfileDiff is quiet when the profile already matches', () => {
  const diff = sharedProfileDiff({ nan: { baseURL: shared.baseUrl, apiKeyEnv: shared.apiKeyEnv, models: shared.models } }, shared)
  assert.equal(diff, undefined)
})

test('syncSharedProfile creates the route in a fresh profile', async () => {
  const { file, cleanup } = tempFile()
  try {
    writeSharedProfile(shared, file)
    const { ctx, state } = settingsCtx({})
    const result = await syncSharedProfile(ctx, { sharedFile: file })
    assert.equal(result.applied, true)
    assert.equal(result.created, true)
    assert.equal(state.providers.nan.baseURL, shared.baseUrl)
    assert.equal(state.providers.nan.apiKeyEnv, 'NAN_API_KEY')
    assert.equal(state.providers.nan.models.length, 3)
  } finally {
    cleanup()
  }
})

test('syncSharedProfile refreshes models of an existing route', async () => {
  const { file, cleanup } = tempFile()
  try {
    writeSharedProfile(shared, file)
    const { ctx, state } = settingsCtx({ nan: { displayName: 'Mine', baseURL: shared.baseUrl, apiKeyEnv: 'NAN_API_KEY', models: [{ id: 'glm5.3' }] } })
    const result = await syncSharedProfile(ctx, { sharedFile: file })
    assert.equal(result.applied, true)
    assert.equal(result.created, false)
    assert.equal(state.providers.nan.displayName, 'Mine')
    assert.equal(state.providers.nan.models.length, 3)
  } finally {
    cleanup()
  }
})

test('syncSharedProfile does nothing without a shared file or settings', async () => {
  const { ctx } = settingsCtx({})
  assert.deepEqual(await syncSharedProfile(ctx, { sharedFile: '/nonexistent/nan.json' }), { applied: false })
  const bare = { get: () => undefined }
  assert.deepEqual(await syncSharedProfile(bare, { sharedFile: '/nonexistent/nan.json' }), { applied: false })
})

test('syncSharedProfile retries once on a settings conflict', async () => {
  const { file, cleanup } = tempFile()
  try {
    writeSharedProfile(shared, file)
    const { ctx, state } = settingsCtx({})
    state.conflict = true
    const result = await syncSharedProfile(ctx, { sharedFile: file })
    assert.equal(result.applied, true)
    assert.equal(state.providers.nan.models.length, 3)
  } finally {
    cleanup()
  }
})
