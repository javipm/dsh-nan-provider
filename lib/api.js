/**
 * Minimal, dependency-free client for the NaN platform API.
 *
 * `GET {base}/usage` returns the member's own token usage and the credits it
 * was billed: one row per (date, model), totals for the requested window and
 * an all-time summary. `credits` is always the current billing period,
 * whatever window is asked for.
 *
 * Docs: https://nan.builders/docs/api — the endpoint is also in the published
 * OpenAPI document at https://nan.builders/openapi.json.
 */

export const DEFAULT_BASE_URL = 'https://api.nan.builders/v1'

/** The API rejects windows wider than 90 inclusive days. */
export const MAX_WINDOW_DAYS = 90

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` in UTC, the shape the usage endpoint expects. */
export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/**
 * Inclusive UTC window of `days` days ending today.
 * Clamped to 1..90 because the API answers 400 outside that span.
 */
export function usageWindow(days = 30, now = new Date()) {
  const span = Number.isFinite(days) ? Math.trunc(days) : 30
  const capped = Math.min(Math.max(span, 1), MAX_WINDOW_DAYS)
  const end = utcDay(now)
  const endMs = Date.parse(`${end}T00:00:00Z`)
  const start = new Date(endMs - (capped - 1) * DAY_MS).toISOString().slice(0, 10)
  return { start, end, days: capped }
}

/**
 * Resolve the bearer key the same way the harness resolves provider keys:
 * the profile's credential store first (`credentials.resolve(ref)`), then the
 * process environment. Never reads the credentials file directly.
 */
export async function resolveApiKey(ctx, ref = 'NAN_API_KEY') {
  const credentials = ctx?.get?.('credentials', false)
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      const resolved = await credentials.resolve(ref)
      if (typeof resolved?.value === 'string' && resolved.value !== '') return resolved.value
    } catch {
      // Fall through to the environment: a missing/corrupt credential store
      // must not turn into a plugin crash.
    }
  }
  const fromEnv = globalThis.process?.env?.[ref]
  return typeof fromEnv === 'string' ? fromEnv : ''
}

/**
 * Query the usage endpoint.
 *
 * @returns {Promise<{ok: true, report: object} | {ok: false, reason: string, status?: number, retryAfter?: number}>}
 */
export async function fetchUsage(options = {}) {
  const {
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    startDate,
    endDate,
    limit = 500,
    timeoutMs = 8000,
    fetchImpl = globalThis.fetch,
  } = options

  if (typeof apiKey !== 'string' || apiKey === '') return { ok: false, reason: 'no-key' }
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'network' }

  let url
  try {
    url = new URL(`${String(baseUrl).replace(/\/+$/u, '')}/usage`)
  } catch {
    return { ok: false, reason: 'network' }
  }
  if (startDate !== undefined) url.searchParams.set('start_date', startDate)
  if (endDate !== undefined) url.searchParams.set('end_date', endDate)
  url.searchParams.set('limit', String(Math.min(Math.max(Number(limit) || 500, 1), 500)))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000))
  timer.unref?.()

  let response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
      signal: controller.signal,
    })
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'unauthorized', status: response.status }
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers?.get?.('retry-after'))
    return { ok: false, reason: 'rate-limit', status: 429, ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}) }
  }
  if (!response.ok) return { ok: false, reason: 'http', status: response.status }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  const report = normalizeReport(payload)
  return report === undefined ? { ok: false, reason: 'invalid' } : { ok: true, report }
}

function num(value) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function text(value) {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function normalizeModelRow(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const model = text(raw.model)
  if (model === undefined) return undefined
  return {
    model,
    promptTokens: num(raw.prompt_tokens) ?? 0,
    cachedTokens: num(raw.cached_tokens) ?? 0,
    completionTokens: num(raw.completion_tokens) ?? 0,
    totalTokens: num(raw.total_tokens) ?? 0,
    apiRequests: num(raw.api_requests) ?? 0,
    credits: num(raw.credits) ?? 0,
  }
}

function normalizeTotals(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const byModelRaw = Array.isArray(raw.by_model) ? raw.by_model : []
  return {
    promptTokens: num(raw.prompt_tokens) ?? 0,
    cachedTokens: num(raw.cached_tokens) ?? 0,
    completionTokens: num(raw.completion_tokens) ?? 0,
    totalTokens: num(raw.total_tokens) ?? 0,
    apiRequests: num(raw.api_requests) ?? 0,
    credits: num(raw.credits) ?? 0,
    byModel: byModelRaw.map(normalizeModelRow).filter(Boolean),
  }
}

function normalizeCredits(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const allowance = num(raw.allowance)
  const used = num(raw.used)
  if (allowance === undefined || used === undefined) return undefined
  return {
    periodStart: text(raw.period_start),
    periodEnd: text(raw.period_end),
    allowance,
    used,
    remaining: num(raw.remaining) ?? allowance - used,
    packCredits: num(raw.pack_credits) ?? 0,
    packExpiresAt: text(raw.pack_expires_at),
    frozen: raw.frozen === true,
  }
}

/**
 * Defensive projection of the documented payload into a stable camelCase
 * shape. Unknown fields are dropped; a missing `credits`/`totals` block is
 * treated as an invalid response rather than rendered as zeroes.
 */
export function normalizeReport(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const credits = normalizeCredits(payload.credits)
  const totals = normalizeTotals(payload.totals)
  if (credits === undefined || totals === undefined) return undefined

  const startDate = text(payload.start_date)
  const endDate = text(payload.end_date)
  let windowDays
  if (startDate !== undefined && endDate !== undefined) {
    const span = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)
    if (Number.isFinite(span) && span >= 0) windowDays = Math.round(span / DAY_MS) + 1
  }

  const rows = (Array.isArray(payload.data) ? payload.data : [])
    .map(normalizeModelRow)
    .filter(Boolean)

  const allTimeRaw = payload.all_time
  const allTime = allTimeRaw !== null && typeof allTimeRaw === 'object' && !Array.isArray(allTimeRaw)
    ? {
        promptTokens: num(allTimeRaw.prompt_tokens) ?? 0,
        completionTokens: num(allTimeRaw.completion_tokens) ?? 0,
        totalTokens: num(allTimeRaw.total_tokens) ?? 0,
        apiRequests: num(allTimeRaw.api_requests) ?? 0,
        cachedAt: text(allTimeRaw.cached_at),
      }
    : undefined

  return {
    fetchedAt: new Date().toISOString(),
    startDate,
    endDate,
    windowDays,
    rows,
    totals,
    allTime,
    credits,
    hasMore: payload.has_more === true,
    nextCursor: text(payload.next_cursor),
  }
}

/**
 * Fetch the model ids the endpoint advertises. Only ids are portable across
 * OpenAI-compatible gateways; capabilities stay in the local catalog.
 *
 * @returns {Promise<{ok: true, ids: string[]} | {ok: false, reason: string, status?: number}>}
 */
export async function fetchModels(options = {}) {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = 8000, fetchImpl = globalThis.fetch } = options
  if (typeof apiKey !== 'string' || apiKey === '') return { ok: false, reason: 'no-key' }
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'network' }

  let url
  try {
    url = new URL(`${String(baseUrl).replace(/\/+$/u, '')}/models`)
  } catch {
    return { ok: false, reason: 'network' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000))
  timer.unref?.()

  let response
  try {
    response = await fetchImpl(url, { method: 'GET', headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' }, signal: controller.signal })
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'unauthorized', status: response.status }
  if (!response.ok) return { ok: false, reason: 'http', status: response.status }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  const ids = rows
    .map(row => (typeof row === 'string' ? row : row?.id))
    .filter(id => typeof id === 'string' && id !== '')
  return ids.length === 0 ? { ok: false, reason: 'invalid' } : { ok: true, ids }
}
