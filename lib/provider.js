/**
 * Locate the NaN provider route the profile actually uses.
 *
 * `/nan-setup` writes the route through the settings service, and manual
 * profiles may already have one. Rather than assuming a hardcoded route id or
 * key ref, the usage client asks the live `llm-pi-ai` settings for the
 * provider whose endpoint is NaN and reuses its `baseURL` and `apiKeyEnv`.
 */
import { NAN_API_KEY_ENV, NAN_BASE_URL, NAN_PROVIDER_ID } from './catalog.js'

/** Resolved `llm-pi-ai` providers, or undefined when settings are unavailable. */
export function readProviderProfiles(ctx) {
  const settings = ctx?.get?.('settings', false)
  if (settings === undefined || typeof settings.describe !== 'function') return undefined
  let rows
  try {
    rows = settings.describe()
  } catch {
    return undefined
  }
  if (!Array.isArray(rows)) return undefined
  const row = rows.find(candidate => candidate?.ns === 'llm-pi-ai')
  const providers = row?.value?.providers
  return providers !== null && typeof providers === 'object' && !Array.isArray(providers) ? providers : undefined
}

function isNanBaseUrl(value) {
  if (typeof value !== 'string' || value === '') return false
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host === 'nan.builders' || host.endsWith('.nan.builders')
  } catch {
    return false
  }
}

/**
 * Pick the NaN route: the configured id first, then any provider pointing at
 * `nan.builders`, then any provider labelled NaN.
 *
 * @returns {{id: string, profile: object} | undefined}
 */
export function findNanProvider(profiles, preferredId = NAN_PROVIDER_ID) {
  if (profiles === undefined) return undefined
  const entries = Object.entries(profiles).filter(([, profile]) => profile !== null && typeof profile === 'object' && !Array.isArray(profile))

  const preferred = profiles[preferredId]
  if (preferred !== null && typeof preferred === 'object' && !Array.isArray(preferred)) {
    return { id: preferredId, profile: preferred }
  }

  const byBaseUrl = entries.find(([, profile]) => isNanBaseUrl(profile.baseURL))
  if (byBaseUrl !== undefined) return { id: byBaseUrl[0], profile: byBaseUrl[1] }

  const byLabel = entries.find(([id, profile]) => /nan/i.test(String(profile.displayName ?? profile.name ?? id)))
  return byLabel === undefined ? undefined : { id: byLabel[0], profile: byLabel[1] }
}

/**
 * Effective connection facts for the usage query: the detected route when
 * there is one, config defaults otherwise.
 */
export function resolveNanRoute(ctx, config) {
  const found = findNanProvider(readProviderProfiles(ctx), config.provider)
  const profile = found?.profile
  return {
    provider: found?.id,
    baseUrl: typeof profile?.baseURL === 'string' && profile.baseURL !== '' ? profile.baseURL : config.baseUrl || NAN_BASE_URL,
    apiKeyEnv:
      typeof profile?.apiKeyEnv === 'string' && profile.apiKeyEnv !== ''
        ? profile.apiKeyEnv
        : config.apiKeyEnv || NAN_API_KEY_ENV,
  }
}
