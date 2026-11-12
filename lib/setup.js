/**
 * `/nan-setup` — turn a stock profile into a NaN one.
 *
 * The operations are the same pair the `/provider` wizard uses: write the
 * `llm-pi-ai` provider profile through the settings service, check the
 * credential ref, and save the default model through `agentDefaultModel`.
 * Nothing is destructive: an existing `nan` route is left untouched, and the
 * previous `openai` route (if any) stays available for old sessions.
 */
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

/** Provider profile written into the `llm-pi-ai` settings namespace. */
export function buildProviderProfile(config) {
  return {
    displayName: NAN_DISPLAY_NAME,
    api: NAN_API,
    baseURL: config.baseUrl || NAN_BASE_URL,
    apiKeyEnv: config.apiKeyEnv || NAN_API_KEY_ENV,
    models: NAN_MODELS,
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

async function writeProvider(settings, revision, providerId, profile) {
  const ops = [{ op: 'set', path: ['providers', providerId], value: profile }]
  try {
    await settings.mutate('llm-pi-ai', ops, revision)
  } catch (error) {
    // A concurrent settings write bumps the revision; one re-read retry is the
    // same recovery the provider wizard applies.
    if (error?.code !== 'SETTINGS_CONFLICT') throw error
    await settings.mutate('llm-pi-ai', ops, llmRow(settings)?.revision)
  }
}

/**
 * Create the provider if missing, check the key, set the default model.
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
  const profile = existing !== null && typeof existing === 'object' && !Array.isArray(existing)
    ? existing
    : buildProviderProfile(config)

  let created = false
  if (existing === undefined) {
    try {
      await writeProvider(settings, row.revision, providerId, profile)
      created = true
    } catch (error) {
      return { ok: false, reason: 'settings-write', detail: error instanceof Error ? error.message : String(error) }
    }
  }

  const apiKeyEnv =
    typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv !== ''
      ? profile.apiKeyEnv
      : config.apiKeyEnv || NAN_API_KEY_ENV

  const credentials = ctx.get('credentials', false)
  let keyConfigured = false
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      keyConfigured = (await credentials.resolve(apiKeyEnv)) !== undefined
    } catch {
      keyConfigured = false
    }
  }

  const model = NAN_MODELS.some(entry => entry.id === config.setupModel)
    ? config.setupModel
    : 'deepseek-v4-flash'
  const defaults = ctx.get('agentDefaultModel', false)
  let defaultSet = false
  let defaultError
  if (defaults !== undefined && typeof defaults.saveSelection === 'function') {
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
    keyConfigured,
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

  const lines = [
    `Provider ${result.providerId}: ${result.created ? 'created' : 'already present (left untouched)'}`,
    `API key (${result.apiKeyEnv}): ${result.keyConfigured ? 'configured' : 'MISSING — store it with /login or the provider settings'}`,
    result.defaultSet
      ? `Default model: ${result.providerId}/${result.model}${result.effort ? ` · ${result.effort}` : ''}`
      : `Default model not saved${result.defaultError ? `: ${result.defaultError}` : ''}`,
  ]
  if (result.created) lines.push('Restart with /restart so the route is mounted.')
  return lines.join('\n')
}
