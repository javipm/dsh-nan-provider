import { fetchUsage, resolveApiKey, usageWindow } from './api.js'

/**
 * One profile-scoped usage source shared by the panel, the footer field and
 * the /usage command, so opening the panel right after a footer refresh does
 * not spend a second request (the endpoint is capped at 30/minute).
 */
export function createUsageSource({ ctx, config }) {
  let cache
  let inflight

  async function load({ force = false } = {}) {
    const now = Date.now()
    const ttlMs = Math.max(0, Number(config.cacheSeconds ?? 20)) * 1000
    if (!force && cache !== undefined && now - cache.at < ttlMs) {
      return { ok: true, report: cache.report, cached: true }
    }
    if (inflight !== undefined) return inflight

    inflight = (async () => {
      const apiKey = await resolveApiKey(ctx, config.apiKeyEnv)
      const window = usageWindow(config.windowDays)
      const result = await fetchUsage({
        apiKey,
        baseUrl: config.baseUrl,
        startDate: window.start,
        endDate: window.end,
        timeoutMs: config.timeoutMs,
        fetchImpl: config.fetchImpl,
      })
      if (result.ok) cache = { at: Date.now(), report: result.report }
      return result
    })().finally(() => {
      inflight = undefined
    })

    return inflight
  }

  return {
    load,
    peek: () => cache?.report,
    clear: () => {
      cache = undefined
    },
  }
}
