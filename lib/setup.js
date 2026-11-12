/**
 * `/nan-setup` — turn a stock profile into a NaN one.
 *
 * Flow: find the provider, resolve (or ask for and store) its API key, fetch
 * the live model list from `{baseURL}/models`, merge it with the shipped
 * catalog, write the provider through the settings service and set the default
 * model through `agentDefaultModel`.
 *
 * Re-running it refreshes the model list, so new models on the cluster show up
 * without editing YAML. Nothing is destructive: `openai` stays available for
 * old sessions.
 */
import { fetchModels } from './api.js'
import {
  NAN_API,
  NAN_API_KEY_ENV,
  NAN_BASE_URL,
  NAN_COMPAT,
  NAN_DISPLAY_NAME,
  NAN_MODELS,
  NAN_PROVIDER_ID,
  NAN_RETRY_POLICY,
} from './catalog.js'

/** Ids that are not chat models and must not enter the provider catalog. */
const NON_CHAT_ID = /(^|[-_.])(embedding|embed|rerank|whisper|tts|kokoro|flux|image|dall-e|audio|transcrib|moderation|stable-diffusion)([-_.]|$)/iu
const NON_CHAT_IDS = new Set(['minimax-h3'])

export function isNonChatModel(id) {
  const value = String(id)
  return NON_CHAT_IDS.has(value.toLowerCase()) || NON_CHAT_ID.test(value)
}

/** Conservative profile for a model the endpoint advertises but the catalog does not describe. */
export function defaultModelProfile(id) {
  return {
    id,
    name: id,
    contextWindow: 1_048_576,
    maxTokens: 32_768,
    input: ['text'],
    compat: {
      supportsDeveloperRole: false,
      supportsUsageInStreaming: true,
      supportsFinishReason: true,
      maxTokensField: 'max_tokens',
    },
  }
}

/**
 * Union of the configured/catalog models and the live endpoint ids. Catalog
 * metadata wins for known ids; unknown chat ids get conservative defaults.
 *
 * @returns {{models: object[], added: string[]}}
 */
export function mergeModels(apiIds, baseModels = NAN_MODELS) {
  const byId = new Map()
  for (const model of baseModels) if (typeof model?.id === 'string') byId.set(model.id, model)
  for (const model of NAN_MODELS) if (typeof model?.id === 'string' && !byId.has(model.id)) byId.set(model.id, model)

  const added = []
  for (const id of apiIds) {
    if (byId.has(id) || isNonChatModel(id)) continue
    byId.set(id, defaultModelProfile(id))
    added.push(id)
  }
  return { models: [...byId.values()], added }
}

/** Provider profile written into the `llm-pi-ai` settings namespace. */
export function buildProviderProfile(config, models = NAN_MODELS) {
  return {
    displayName: NAN_DISPLAY_NAME,
    api: NAN_API,
    baseURL: config.baseUrl || NAN_BASE_URL,
    apiKeyEnv: config.apiKeyEnv || NAN_API_KEY_ENV,
    models,
    compat: NAN_COMPAT,
    retryPolicy: NAN_RETRY_POLICY,
  }
}

function llmRow(settings) {
  if (settings === undefined || typeof settings.describe !== 'function') return undefined
  try {
    const rows = settings.describe()
    return Array.isArray(rows) ? rows.find(row => row?.ns === 'llm-pi-ai') : undefined
  } catch {
    return undefined
  }
}

async function writeOps(settings, ops) {
  const revision = llmRow(settings)?.revision
  try {
    await settings.mutate('llm-pi-ai', ops, revision)
  } catch (error) {
    // A concurrent settings write bumps the revision; one re-read retry is the
    // same recovery the provider wizard applies.
    if (error?.code !== 'SETTINGS_CONFLICT') throw error
    await settings.mutate('llm-pi-ai', ops, llmRow(settings)?.revision)
  }
}

async function resolveKey(ctx, ref) {
  const credentials = ctx.get('credentials', false)
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      const resolved = await credentials.resolve(ref)
      if (typeof resolved?.value === 'string' && resolved.value !== '') return resolved.value
    } catch {
      // Fall through to the environment / prompt.
    }
  }
  const fromEnv = globalThis.process?.env?.[ref]
  return typeof fromEnv === 'string' && fromEnv !== '' ? fromEnv : undefined
}

/** Ask for the key when neither the store nor the environment has one. */
async function promptForKey(ctx, ref) {
  const dialogs = ctx.get('tuiDialogs', false)
  if (dialogs === undefined || typeof dialogs.input !== 'function') return { key: undefined, stored: false }

  let entered
  try {
    entered = await dialogs.input(ctx, {
      title: `NaN API key (${ref}) — visible while typing`,
      placeholder: 'sk-...',
      timeoutMs: 180_000,
    })
  } catch {
    return { key: undefined, stored: false }
  }
  const key = typeof entered === 'string' ? entered.trim() : ''
  if (key === '') return { key: undefined, stored: false }

  const credentials = ctx.get('credentials', false)
  if (credentials !== undefined && typeof credentials.set === 'function') {
    try {
      await credentials.set(ref, key)
      return { key, stored: true }
    } catch (error) {
      return { key, stored: false, storeError: error instanceof Error ? error.message : String(error) }
    }
  }
  return { key, stored: false, storeError: 'credential store unavailable' }
}

/**
 * Create or refresh the NaN provider, check/store the key, refresh models and
 * set the default model.
 *
 * @returns {Promise<object>} a result the command turns into user-facing text.
 */
export async function runNanSetup(ctx, config) {
  const settings = ctx.get('settings', false)
  if (settings === undefined || typeof settings.mutate !== 'function') {
    return { ok: false, reason: 'no-settings' }
  }
  const row = llmRow(settings)
  if (row === undefined) return { ok: false, reason: 'no-llm-pi-ai' }

  const providerId = config.provider || NAN_PROVIDER_ID
  const providers = row.value?.providers !== null && typeof row.value?.providers === 'object' ? row.value.providers : {}
  const existing = providers?.[providerId]
  const hasExisting = existing !== null && typeof existing === 'object' && !Array.isArray(existing)
  const baseUrl = (hasExisting && typeof existing.baseURL === 'string' && existing.baseURL) || config.baseUrl || NAN_BASE_URL
  const apiKeyEnv =
    (hasExisting && typeof existing.apiKeyEnv === 'string' && existing.apiKeyEnv) || config.apiKeyEnv || NAN_API_KEY_ENV

  let key = await resolveKey(ctx, apiKeyEnv)
  let keyStored = false
  let keyStoreError
  if (key === undefined) {
    const prompted = await promptForKey(ctx, apiKeyEnv)
    key = prompted.key
    keyStored = prompted.stored
    keyStoreError = prompted.storeError
  }

  let apiIds = []
  let fetchError
  if (key !== undefined) {
    const fetched = await fetchModels({
      apiKey: key,
      baseUrl,
      timeoutMs: config.timeoutMs,
      fetchImpl: config.fetchImpl,
    })
    if (fetched.ok) apiIds = fetched.ids
    else fetchError = fetched
  }

  const baseModels = hasExisting && Array.isArray(existing.models) && existing.models.length > 0 ? existing.models : NAN_MODELS
  const { models, added } = mergeModels(apiIds, baseModels)

  const profile = hasExisting
    ? { ...existing, models }
    : buildProviderProfile({ ...config, baseUrl, apiKeyEnv }, models)

  let created = false
  try {
    if (hasExisting) {
      const ops = [{ op: 'set', path: ['providers', providerId, 'models'], value: models }]
      if (typeof existing.baseURL !== 'string' || existing.baseURL === '') ops.push({ op: 'set', path: ['providers', providerId, 'baseURL'], value: baseUrl })
      if (typeof existing.apiKeyEnv !== 'string' || existing.apiKeyEnv === '') ops.push({ op: 'set', path: ['providers', providerId, 'apiKeyEnv'], value: apiKeyEnv })
      await writeOps(settings, ops)
    } else {
      await writeOps(settings, [{ op: 'set', path: ['providers', providerId], value: profile }])
      created = true
    }
  } catch (error) {
    return { ok: false, reason: 'settings-write', detail: error instanceof Error ? error.message : String(error) }
  }

  const wantedModel = config.setupModel
  const model = models.some(entry => entry.id === wantedModel)
    ? wantedModel
    : models.some(entry => entry.id === 'deepseek-v4-flash')
      ? 'deepseek-v4-flash'
      : models[0]?.id

  const defaults = ctx.get('agentDefaultModel', false)
  let defaultSet = false
  let defaultError
  if (model !== undefined && defaults !== undefined && typeof defaults.saveSelection === 'function') {
    try {
      await defaults.saveSelection({ provider: providerId, model, ...(config.setupEffort ? { reasoningEffort: config.setupEffort } : {}) })
      defaultSet = true
    } catch (error) {
      defaultError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    ok: true,
    created,
    providerId,
    apiKeyEnv,
    keyConfigured: key !== undefined,
    keyStored,
    ...(keyStoreError === undefined ? {} : { keyStoreError }),
    modelCount: models.length,
    added,
    fetchFailed: fetchError !== undefined,
    ...(fetchError === undefined ? {} : { fetchReason: fetchError.reason, fetchStatus: fetchError.status }),
    model,
    effort: config.setupEffort,
    defaultSet,
    ...(defaultError === undefined ? {} : { defaultError }),
  }
}

/** Human summary returned by `/nan-setup`. */
export function describeNanSetup(result) {
  if (!result.ok) {
    switch (result.reason) {
      case 'no-settings':
        return 'NaN setup unavailable: this host has no settings service.'
      case 'no-llm-pi-ai':
        return 'NaN setup unavailable: the llm-pi-ai provider adapter is not mounted.'
      case 'settings-write':
        return `Could not write the NaN provider: ${result.detail ?? 'settings error'}`
      default:
        return 'NaN setup failed.'
    }
  }

  const lines = [`Provider ${result.providerId}: ${result.created ? 'created' : 'refreshed'}`]
  const added = Array.isArray(result.added) && result.added.length > 0
    ? ` (${result.added.length} new: ${result.added.slice(0, 5).join(', ')}${result.added.length > 5 ? '…' : ''})`
    : ''
  lines.push(`Models: ${result.modelCount}${added}`)
  if (result.fetchFailed) {
    lines.push(`Model refresh failed (${result.fetchReason}${result.fetchStatus ? ` ${result.fetchStatus}` : ''}) — kept the configured list`)
  }
  if (!result.keyConfigured) {
    lines.push(`API key (${result.apiKeyEnv}): MISSING — store it with /login or the provider settings`)
  } else if (result.keyStored) {
    lines.push(`API key (${result.apiKeyEnv}): stored now`)
  } else {
    lines.push(`API key (${result.apiKeyEnv}): configured`)
  }
  if (result.keyStoreError !== undefined) lines.push(`Could not store the key: ${result.keyStoreError}`)
  lines.push(
    result.defaultSet
      ? `Default model: ${result.providerId}/${result.model}${result.effort ? ` · ${result.effort}` : ''}`
      : `Default model not saved${result.defaultError ? `: ${result.defaultError}` : ''}`,
  )
  if (result.created) lines.push('Restart with /restart so the route is mounted.')
  return lines.join('\n')
}
