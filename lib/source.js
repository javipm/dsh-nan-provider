import { fetchUsage, resolveApiKey, usageWindow } from './api.js'
import { resolveNanRoute } from './provider.js'

/**
 * One profile-scoped usage source shared by the panel, the footer field and
 * the /nan-usage command, so opening the panel right after a footer refresh does
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
      // Re-read the route per query: /nan-setup and /provider edits reach the
      // next refresh without restarting the plugin.
      const route = resolveNanRoute(ctx, config)
      const apiKey = await resolveApiKey(ctx, route.apiKeyEnv)
      const window = usageWindow(config.windowDays)
      const result = await fetchUsage({
        apiKey,
        baseUrl: route.baseUrl,
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
