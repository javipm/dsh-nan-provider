import test from 'node:test'
import assert from 'node:assert/strict'

import { findNanProvider, readProviderProfiles, resolveNanRoute } from '../lib/provider.js'

function ctxWith(providers) {
  return {
    get(name) {
      if (name !== 'settings') return undefined
      return { describe: () => [{ ns: 'llm-pi-ai', revision: 3, value: { providers } }] }
    },
  }
}

const nanProfile = {
  displayName: 'NaN',
  api: 'openai-completions',
  baseURL: 'https://api.nan.builders/v1',
  apiKeyEnv: 'OPENAI_API_KEY',
}

test('readProviderProfiles returns undefined without settings', () => {
  assert.equal(readProviderProfiles({ get: () => undefined }), undefined)
  assert.equal(readProviderProfiles({ get: () => ({ describe: () => [] }) }), undefined)
})

test('findNanProvider prefers the configured id', () => {
  const found = findNanProvider({ nan: nanProfile, other: { baseURL: 'https://api.nan.builders/v1' } }, 'nan')
  assert.equal(found.id, 'nan')
})

test('findNanProvider falls back to the nan.builders base URL', () => {
  const found = findNanProvider({ custom: { baseURL: 'https://api.nan.builders/v1', apiKeyEnv: 'NAN_KEY' } }, 'nan')
  assert.equal(found.id, 'custom')
  assert.equal(found.profile.apiKeyEnv, 'NAN_KEY')
})

test('findNanProvider falls back to the display label', () => {
  const found = findNanProvider({ weird: { displayName: 'NaN', baseURL: 'https://elsewhere.test/v1' } }, 'nan')
  assert.equal(found.id, 'weird')
})

test('findNanProvider returns undefined when nothing matches', () => {
  assert.equal(findNanProvider({ deepseek: { baseURL: 'https://api.deepseek.com' } }, 'nan'), undefined)
  assert.equal(findNanProvider(undefined, 'nan'), undefined)
})

test('resolveNanRoute requires a configured NaN route', () => {
  const route = resolveNanRoute(ctxWith({ nan: nanProfile }), { provider: 'nan', baseUrl: 'https://fallback/v1', apiKeyEnv: 'FALLBACK' })
  assert.equal(route.provider, 'nan')
  assert.equal(route.baseUrl, 'https://api.nan.builders/v1')
  assert.equal(route.apiKeyEnv, 'OPENAI_API_KEY')

  assert.equal(resolveNanRoute({ get: () => undefined }, { provider: 'nan', baseUrl: 'https://fallback/v1', apiKeyEnv: 'FALLBACK' }), undefined)
  assert.equal(resolveNanRoute(ctxWith({ deepseek: { baseURL: 'https://api.deepseek.com' } }), { provider: 'nan' }), undefined)
})

test('resolveNanRoute fills the NaN defaults for a bare route', () => {
  const route = resolveNanRoute(ctxWith({ nan: { displayName: 'NaN' } }), { provider: 'nan' })
  assert.equal(route.baseUrl, 'https://api.nan.builders/v1')
  assert.equal(route.apiKeyEnv, 'OPENAI_API_KEY')
})
