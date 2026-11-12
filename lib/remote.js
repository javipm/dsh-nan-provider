/**
 * Loopback HTTP route for the web client card.
 *
 * The browser cannot read the credential store, so the usage query stays on
 * the host: the client posts to `/api/nan-provider/usage` and gets the same
 * report the TUI panel renders. Registration goes through the Connection
 * service's exact Fetch registry (the seam the Desktop web app mounts), so the
 * route inherits its authentication and is absent wherever Connection is not
 * composed (the TUI).
 */
import { fetchUsage } from './api.js'
import { describeError } from './text-report.js'

export const NAN_RPC_PATH = '/api/nan-provider/usage'

/**
 * Build the JSON handler for the route. Pure enough to test without a host:
 * it receives the resolved route and a fetch implementation.
 *
 * @param {{resolveRoute: () => object | undefined, resolveKey: (ref: string) => Promise<string>, fetchImpl?: typeof fetch}} deps
 * @returns {(request: Request) => Promise<Response>}
 */
export function createUsageHandler(deps) {
  return async function handleUsage(request) {
    if (request?.signal?.aborted === true) return json({ ok: false, error: 'aborted' }, 499)

    const route = deps.resolveRoute()
    if (route === undefined) {
      return json({ ok: false, error: 'no-provider', message: 'No NaN provider configured — run /nan-setup first' })
    }

    const apiKey = await deps.resolveKey(route.apiKeyEnv)
    const result = await fetchUsage({
      apiKey,
      baseUrl: route.baseUrl,
      timeoutMs: deps.timeoutMs,
      fetchImpl: deps.fetchImpl,
    })

    if (!result.ok) {
      return json({
        ok: false,
        error: result.reason,
        ...(result.status === undefined ? {} : { status: result.status }),
        message: describeError(result, { baseUrl: route.baseUrl, apiKeyEnv: route.apiKeyEnv }),
      })
    }
    return json({ ok: true, report: result.report })
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/**
 * Register the route on the host's Fetch registry.
 *
 * @returns {(() => unknown) | undefined} the route disposer, or undefined when
 *   this composition has no Connection service.
 */
export function registerUsageRoute(ctx, handler) {
  const connection = ctx.get('connection', false)
  const registry = connection?.fetch
  if (registry === undefined || typeof registry.register !== 'function') return undefined
  return registry.register({
    path: NAN_RPC_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => handler(request),
  })
}
