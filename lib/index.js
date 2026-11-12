/**
 * dsh-nan-usage — NaN subscription usage inside the DeepSeek Harness TUI.
 *
 * Surfaces:
 * - a sidebar panel (`ctx.tuiPanels`) next to Info/Todo/Jobs: credits left in
 *   the current billing period, the last N days of tokens/requests/credits and
 *   a per-model breakdown;
 * - a `/usage` command that opens that panel, or prints the report as text
 *   when `/usage text` is used (also the fallback on hosts without panels);
 * - an optional footer field (`ctx.tuiStatus.setField`, off by default).
 *
 * The data comes from `GET https://api.nan.builders/v1/usage` with the same
 * `OPENAI_API_KEY` credential the NaN model provider uses.
 */
import { createUsageSource } from './source.js'
import { makeUsagePanel } from './panel.js'
import { describeError, usageText, usageTone } from './text-report.js'
import { daysUntil, formatCredits, formatPercent, shortDate } from './format.js'

export const name = 'nan-usage'

const DEFAULTS = {
  apiKeyEnv: 'OPENAI_API_KEY',
  baseUrl: 'https://api.nan.builders/v1',
  windowDays: 30,
  timeoutMs: 8000,
  cacheSeconds: 20,
  autoRefreshSeconds: 60,
  commandName: 'usage',
  panelId: 'usage',
  panelTitle: 'NaN usage',
  lowCreditsPercent: 10,
  footer: true,
  footerRefreshMinutes: 15,
}

function normalizedConfig(raw) {
  const input = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const config = { ...DEFAULTS, ...input }
  config.windowDays = Math.min(Math.max(Math.trunc(Number(config.windowDays)) || 30, 1), 90)
  config.timeoutMs = Math.min(Math.max(Math.trunc(Number(config.timeoutMs)) || 8000, 1000), 60_000)
  config.cacheSeconds = Math.max(0, Math.trunc(Number(config.cacheSeconds)) || 0)
  config.autoRefreshSeconds = Math.max(0, Math.trunc(Number(config.autoRefreshSeconds)) || 0)
  config.footerRefreshMinutes = Math.max(1, Math.trunc(Number(config.footerRefreshMinutes)) || 15)
  config.lowCreditsPercent = Math.min(Math.max(Number(config.lowCreditsPercent) || 0, 0), 100)
  if (typeof config.baseUrl !== 'string' || !/^https?:\/\//u.test(config.baseUrl)) config.baseUrl = DEFAULTS.baseUrl
  config.footer = config.footer === true
  return config
}

/** Register the sidebar panel; returns the host's full panel id, if known. */
function registerUsagePanel(ctx, config, source) {
  const panels = ctx.get('tuiPanels', false)
  if (panels === undefined || typeof panels.register !== 'function') return { panels, panelId: undefined }

  let dispose
  try {
    dispose = panels.register({
      apiVersion: 1,
      id: config.panelId,
      title: config.panelTitle,
      icon: '◈',
      order: 16,
      minColumns: 28,
      component: makeUsagePanel({ source, config }),
    })
  } catch (error) {
    ctx.logger?.warn?.(`[nan-usage] panel registration failed: ${String(error)}`)
    return { panels, panelId: undefined }
  }
  if (typeof dispose !== 'function') return { panels, panelId: undefined }

  let panelId
  try {
    const own = panels.list().find(entry => entry.id.endsWith(`:${config.panelId}`))
    panelId = own?.id
  } catch {
    panelId = undefined
  }
  return { panels, panelId }
}

/** `/usage` — open the panel, or answer with the compact text report. */
function registerUsageCommand(ctx, config, source, panelRef) {
  const commands = ctx.get('commands', false)
  if (commands === undefined || typeof commands.register !== 'function') return

  ctx.effect(() =>
    commands.register({
      name: config.commandName,
      description: 'NaN subscription usage: credits left, billing period and token spend',
      recordInput: false,
      handler: async ({ rawInput } = {}) => {
        const argument = typeof rawInput === 'string' ? rawInput.trim().toLowerCase() : ''
        const { panels, panelId } = panelRef
        if (argument !== 'text' && argument !== 'report' && panels !== undefined && panelId !== undefined) {
          try {
            if (panels.open(panelId)) return { kind: 'success', text: '' }
          } catch {
            // Fall through to the text report.
          }
        }
        const result = await source.load({ force: true })
        if (!result.ok) return { kind: 'error', text: `NaN usage: ${describeError(result, config)}` }
        return { kind: 'success', text: usageText(result.report) }
      },
    }),
  )
}

/** Optional footer cell: remaining credits, refreshed on a timer. */
function registerFooterField(ctx, config, source) {
  const status = ctx.get('tuiStatus', false)
  if (status === undefined || typeof status.setField !== 'function') return

  const update = async () => {
    const result = await source.load()
    if (!result.ok) {
      status.setField(
        'nan-usage',
        'NaN ?',
        { slot: 'right-tail', tone: 'error', maxCells: 16, detail: `NaN usage: ${describeError(result, config)}` },
        ctx,
      )
      return
    }
    const { credits } = result.report
    const leftDays = credits.periodEnd === undefined ? undefined : daysUntil(credits.periodEnd)
    const ratio = credits.allowance > 0 ? credits.used / credits.allowance : undefined
    const detail =
      `${formatCredits(credits.used)} / ${formatCredits(credits.allowance)} credits used` +
      `${ratio === undefined ? '' : ` (${formatPercent(ratio)})`} · ${formatCredits(credits.remaining)} left` +
      `${leftDays === undefined ? '' : ` · ${leftDays}d left`} · period ends ${shortDate(credits.periodEnd)}` +
      `${credits.frozen ? ' · frozen' : ''}`
    const tone = usageTone(credits)
    status.setField(
      'nan-usage',
      `NaN ${formatCredits(credits.remaining)} cr${leftDays === undefined ? '' : ` · ${leftDays}d`}`,
      { slot: 'right-tail', tone: tone === 'warning' || tone === 'error' ? tone : 'dim', maxCells: 24, detail },
      ctx,
    )
  }

  ctx.effect(() => {
    const initial = setTimeout(() => void update(), 2000)
    initial.unref?.()
    const interval = setInterval(() => void update(), config.footerRefreshMinutes * 60_000)
    interval.unref?.()
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  })
}

/**
 * Mount the plugin.
 * @param ctx Cordis context of this profile row.
 * @param rawConfig Config from the bundle patch (all keys optional).
 */
export function apply(ctx, rawConfig = {}) {
  const config = normalizedConfig(rawConfig)
  const source = createUsageSource({ ctx, config })
  const panelRef = { panels: undefined, panelId: undefined }

  // Wait for the TUI surfaces instead of probing at activation time: Cordis
  // applies a row before its sibling services are necessarily mounted, and a
  // plain `ctx.get` here can legitimately answer "not yet".
  ctx.inject(['tuiPanels'], panelCtx => {
    const registered = registerUsagePanel(panelCtx, config, source)
    panelRef.panels = registered.panels
    panelRef.panelId = registered.panelId
  })

  ctx.inject(['commands'], commandCtx => {
    try {
      registerUsageCommand(commandCtx, config, source, panelRef)
    } catch (error) {
      commandCtx.logger?.warn?.(`[nan-usage] command registration failed: ${String(error)}`)
    }
  })

  if (config.footer) {
    ctx.inject(['tuiStatus'], statusCtx => {
      try {
        registerFooterField(statusCtx, config, source)
      } catch (error) {
        statusCtx.logger?.warn?.(`[nan-usage] footer field registration failed: ${String(error)}`)
      }
    })
  }

}
