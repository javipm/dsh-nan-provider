/**
 * One NaN provider profile shared by every DSH profile.
 *
 * `desktop` and `dsh-tui` keep separate `cordis.patch.yml` files, so a setup
 * done in one does not reach the other. The credential store is already common
 * (`~/.dsh/.credentials.yaml`); this file makes the provider itself common too.
 *
 * `/nan-setup` writes it after a successful run; every profile's plugin reads it
 * on activation and applies it through its own settings service when that
 * profile is missing the route or the model list is behind.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const FILE_NAME = 'nan-provider.json'
const FORMAT_VERSION = 1

/** `$DSH_HOME` (or `~/.dsh`), the shared root both profiles live under. */
export function dshHomeDir() {
  const fromEnv = globalThis.process?.env?.DSH_HOME
  return typeof fromEnv === 'string' && fromEnv !== '' ? fromEnv : join(homedir(), '.dsh')
}

export function sharedProfilePath() {
  return join(dshHomeDir(), FILE_NAME)
}

/** Validate a parsed shared file; anything malformed answers undefined. */
export function parseSharedProfile(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const { provider, baseUrl, apiKeyEnv, models } = value
  if (typeof provider !== 'string' || provider === '') return undefined
  if (typeof baseUrl !== 'string' || baseUrl === '') return undefined
  if (typeof apiKeyEnv !== 'string' || apiKeyEnv === '') return undefined
  if (!Array.isArray(models) || models.length === 0) return undefined
  if (!models.every(model => model !== null && typeof model === 'object' && typeof model.id === 'string')) return undefined
  return { provider, baseUrl, apiKeyEnv, models }
}

/** Read the shared profile, or undefined when absent/unreadable. */
export function readSharedProfile(path = sharedProfilePath()) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  try {
    return parseSharedProfile(JSON.parse(text))
  } catch {
    return undefined
  }
}

/** Write the shared profile atomically; a failure must not break setup. */
export function writeSharedProfile(profile, path = sharedProfilePath()) {
  const payload = { version: FORMAT_VERSION, updatedAt: new Date().toISOString(), ...profile }
  try {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${globalThis.process?.pid ?? 0}.tmp`
    writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    renameSync(temporary, path)
    return true
  } catch {
    return false
  }
}

/**
 * Whether this profile already matches the shared profile.
 * Compared on ids plus the sizes that change a request: a new model or a
 * corrected window means the profile is behind.
 */
export function sharedProfileDiff(providers, shared) {
  if (shared === undefined) return undefined
  const existing = providers?.[shared.provider]
  if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
    return { created: true, baseUrl: shared.baseUrl, apiKeyEnv: shared.apiKeyEnv, models: shared.models }
  }
  const current = Array.isArray(existing.models) ? existing.models : []
  const byId = new Map(current.map(model => [model?.id, model]))
  const missing = shared.models.filter(model => !byId.has(model.id))
  const changed = shared.models.filter(model => {
    const mine = byId.get(model.id)
    if (mine === undefined) return false
    return (mine.contextWindow ?? null) !== (model.contextWindow ?? null) || (mine.maxTokens ?? null) !== (model.maxTokens ?? null)
  })
  if (missing.length === 0 && changed.length === 0 && existing.baseURL === shared.baseUrl && existing.apiKeyEnv === shared.apiKeyEnv) {
    return undefined
  }
  return {
    created: false,
    baseUrl: shared.baseUrl,
    apiKeyEnv: shared.apiKeyEnv,
    models: shared.models,
    addedModels: missing.map(model => model.id),
  }
}

/**
 * Publish this profile's NaN route when no shared file exists yet.
 *
 * Covers profiles configured before the shared file existed: the first one to
 * boot after upgrading writes the file, and the other picks it up. An existing
 * shared file is never overwritten here — `/nan-setup` owns updates.
 *
 * @returns {{published: boolean, reason?: string}}
 */
export function publishSharedFromLocal(ctx, config = {}) {
  const path = config.sharedFile || sharedProfilePath()
  if (readSharedProfile(path) !== undefined) return { published: false, reason: 'exists' }

  const settings = ctx.get('settings', false)
  if (settings === undefined || typeof settings.describe !== 'function') return { published: false, reason: 'no-settings' }
  let row
  try {
    const rows = settings.describe()
    row = Array.isArray(rows) ? rows.find(candidate => candidate?.ns === 'llm-pi-ai') : undefined
  } catch {
    return { published: false, reason: 'no-settings' }
  }
  const providers = row?.value?.providers
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) {
    return { published: false, reason: 'no-provider' }
  }
  for (const [id, profile] of Object.entries(providers)) {
    if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) continue
    const models = Array.isArray(profile.models) ? profile.models : []
    if (models.length === 0) continue
    const looksNan = id === 'nan' || typeof profile.baseURL === 'string' && profile.baseURL.includes('nan.builders')
    if (!looksNan) continue
    const ok = writeSharedProfile(
      {
        provider: id,
        baseUrl: typeof profile.baseURL === 'string' && profile.baseURL !== '' ? profile.baseURL : 'https://api.nan.builders/v1',
        apiKeyEnv: typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv !== '' ? profile.apiKeyEnv : 'NAN_API_KEY',
        models,
      },
      path,
    )
    return ok ? { published: true } : { published: false, reason: 'write' }
  }
  return { published: false, reason: 'no-provider' }
}

/**
 * Apply the shared profile into this profile's `llm-pi-ai` settings.
 *
 * @returns {Promise<{applied: boolean, created?: boolean, addedModels?: string[], error?: string}>}
 */
export async function syncSharedProfile(ctx, config = {}) {
  const path = config.sharedFile || sharedProfilePath()
  const shared = readSharedProfile(path)
  if (shared === undefined) return { applied: false }

  const settings = ctx.get('settings', false)
  if (settings === undefined || typeof settings.mutate !== 'function' || typeof settings.describe !== 'function') {
    return { applied: false }
  }

  let row
  try {
    const rows = settings.describe()
    row = Array.isArray(rows) ? rows.find(candidate => candidate?.ns === 'llm-pi-ai') : undefined
  } catch {
    return { applied: false }
  }

  const providers = row?.value?.providers !== null && typeof row?.value?.providers === 'object' ? row.value.providers : {}
  const diff = sharedProfileDiff(providers, shared)
  if (diff === undefined) return { applied: false }

  const ops = []
  if (diff.created) {
    ops.push({
      op: 'set',
      path: ['providers', shared.provider],
      value: { displayName: 'NaN', api: 'openai-completions', baseURL: diff.baseUrl, apiKeyEnv: diff.apiKeyEnv, models: diff.models },
    })
  } else {
    ops.push({ op: 'set', path: ['providers', shared.provider, 'models'], value: diff.models })
    ops.push({ op: 'set', path: ['providers', shared.provider, 'baseURL'], value: diff.baseUrl })
    ops.push({ op: 'set', path: ['providers', shared.provider, 'apiKeyEnv'], value: diff.apiKeyEnv })
  }

  try {
    try {
      // A fresh profile may not describe the namespace yet; the mutate itself
      // creates it, so only pass a revision when there is one.
      await settings.mutate('llm-pi-ai', ops, row?.revision)
    } catch (error) {
      if (error?.code !== 'SETTINGS_CONFLICT') throw error
      const fresh = settings.describe().find(candidate => candidate?.ns === 'llm-pi-ai')
      await settings.mutate('llm-pi-ai', ops, fresh?.revision)
    }
  } catch (error) {
    return { applied: false, error: error instanceof Error ? error.message : String(error) }
  }

  return { applied: true, created: diff.created, addedModels: diff.addedModels ?? [] }
}
