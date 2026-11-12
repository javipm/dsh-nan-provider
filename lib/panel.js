import {
  daysUntil,
  formatCredits,
  formatInteger,
  formatPercent,
  formatTokens,
  progressBar,
  shortDate,
  sparkline,
  timeAgo,
  truncateCells,
} from './format.js'
import { describeError, usageTone } from './text-report.js'

/** Low-credit badge: `warning` under the threshold, `error` when nearly dry. */
function badgeFor(report, config) {
  const credits = report?.credits
  if (credits === undefined) return undefined
  if (credits.frozen) return 'error'
  const threshold = Number(config.lowCreditsPercent ?? 10)
  if (!Number.isFinite(threshold) || threshold <= 0 || credits.allowance <= 0) return undefined
  const leftPercent = (credits.remaining / credits.allowance) * 100
  if (leftPercent <= Math.min(2, threshold)) return 'error'
  if (leftPercent <= threshold) return 'warning'
  return undefined
}

/** Per-date credits for the sparkline (dates ascending). */
function dailyCredits(rows) {
  const byDate = new Map()
  for (const row of rows) {
    if (typeof row.date !== 'string') continue
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.credits)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, credits]) => credits)
}

/**
 * Sidebar panel: the same visual language as the built-in Info panel
 * (labelled Divider sections, dim labels, scrollable body).
 */
export function makeUsagePanel({ source, config }) {
  return function NanUsagePanel({ React, ui, host, width, height, focused, visible }) {
    const { Box, Text, Divider, ScrollBox } = ui
    const h = React.createElement

    const [state, setState] = React.useState({ phase: 'loading', report: undefined, error: undefined })
    const aliveRef = React.useRef(true)
    const busyRef = React.useRef(false)
    const hostRef = React.useRef(host)
    hostRef.current = host

    const refresh = React.useCallback(
      async force => {
        if (busyRef.current) return
        busyRef.current = true
        setState(previous => ({
          phase: previous.report !== undefined ? 'refreshing' : 'loading',
          report: previous.report,
          error: undefined,
        }))

        let result
        try {
          result = await source.load({ force })
        } catch (error) {
          result = { ok: false, reason: 'invalid', detail: error instanceof Error ? error.message : String(error) }
        }
        busyRef.current = false
        if (!aliveRef.current) return

        if (result.ok) {
          setState({ phase: 'ready', report: result.report, error: undefined })
          const badge = badgeFor(result.report, config)
          if (badge !== undefined) hostRef.current?.notify?.(badge, 0)
          else hostRef.current?.clearBadge?.()
        } else {
          setState(previous => ({ phase: 'error', report: previous.report, error: result }))
          hostRef.current?.notify?.('error', 0)
        }
      },
      [source],
    )

    React.useEffect(() => {
      aliveRef.current = true
      void refresh(false)
      return () => {
        aliveRef.current = false
      }
    }, [refresh])

    // The panel clock is the host's shared animation time: no private timers.
    const autoSeconds = Number(config.autoRefreshSeconds ?? 60)
    const intervalMs = Number.isFinite(autoSeconds) && autoSeconds > 0 ? autoSeconds * 1000 : null
    const useAnimationTime = ui.useAnimationTime
    const clock = typeof useAnimationTime === 'function' ? useAnimationTime(visible ? intervalMs : null) : 0
    const lastClockRef = React.useRef(clock)
    React.useEffect(() => {
      if (clock === lastClockRef.current) return
      lastClockRef.current = clock
      if (visible && intervalMs !== null) void refresh(true)
    }, [clock, visible, intervalMs, refresh])

    React.useEffect(() => {
      if (typeof host.onKey !== 'function') return undefined
      return host.onKey(event => {
        if (event.key?.ctrl === true || event.key?.meta === true || event.key?.alt === true) return
        if (event.input === 'r') {
          event.preventDefault()
          void refresh(true)
        }
      })
    }, [host, refresh])

    const report = state.report
    const credits = report?.credits
    const totals = report?.totals
    const ratio = credits !== undefined && credits.allowance > 0 ? credits.used / credits.allowance : undefined
    const tone = usageTone(credits)
    const innerWidth = Math.max(8, Math.floor(width) - 2)

    const showTokens = innerWidth >= 48
    const showRequests = innerWidth >= 60
    const creditColumn = 9
    const tokenColumn = 9
    const requestColumn = 8
    const nameColumn = Math.max(9, innerWidth - creditColumn - (showTokens ? tokenColumn : 0) - (showRequests ? requestColumn : 0))

    const tableRow = (key, model, creditText, tokenText, requestText, dim = false) =>
      h(
        Box,
        { key, flexDirection: 'row', width: '100%', flexShrink: 0 },
        h(
          Box,
          { width: nameColumn, flexShrink: 0, overflow: 'hidden' },
          h(Text, { dimColor: dim, wrap: 'truncate-end' }, truncateCells(model, nameColumn)),
        ),
        h(Box, { width: creditColumn, flexShrink: 0, justifyContent: 'flex-end' }, h(Text, { dimColor: dim }, creditText)),
        showTokens
          ? h(Box, { width: tokenColumn, flexShrink: 0, justifyContent: 'flex-end' }, h(Text, { dimColor: dim }, tokenText))
          : null,
        showRequests
          ? h(Box, { width: requestColumn, flexShrink: 0, justifyContent: 'flex-end' }, h(Text, { dimColor: dim }, requestText))
          : null,
      )

    const body = []

    if (state.phase === 'error' && report !== undefined) {
      body.push(
        h(Text, { key: 'stale', color: 'error', wrap: 'truncate-end', flexShrink: 0 }, `! ${describeError(state.error, config)}`),
      )
    }

    if (report === undefined) {
      body.push(
        h(
          Box,
          { key: 'empty', flexDirection: 'column', marginTop: 1 },
          h(Text, { dimColor: true }, state.phase === 'loading' ? 'Querying api.nan.builders…' : describeError(state.error, config)),
          state.phase === 'error' ? h(Text, { dimColor: true }, 'Press r to retry') : null,
        ),
      )
    } else {
      const leftDays = credits?.periodEnd !== undefined ? daysUntil(credits.periodEnd) : undefined
      const models = [...totals.byModel].sort((a, b) => b.credits - a.credits)
      const visibleModels = models.slice(0, 6)
      const daily = dailyCredits(report.rows)
      const sparkWidth = Math.max(8, Math.min(28, innerWidth - 13))

      body.push(
        h(
          Box,
          { key: 'credits', flexDirection: 'column', width: '100%', marginTop: 1 },
          h(Divider, { title: 'Credits' }),
          ratio !== undefined
            ? h(
                Box,
                { flexDirection: 'column', width: '100%' },
                h(
                  Box,
                  { flexDirection: 'row', width: '100%' },
                  h(Text, { color: tone }, progressBar(ratio, Math.max(10, Math.min(22, innerWidth - 8)))),
                  h(Text, { color: tone }, ` ${formatPercent(ratio)}`),
                ),
                h(Text, null, `${formatCredits(credits.used)} / ${formatCredits(credits.allowance)} credits`),
                h(
                  Text,
                  { dimColor: true },
                  `${formatCredits(credits.remaining)} left${leftDays === undefined ? '' : ` · ${leftDays}d left`}`,
                ),
                credits.periodStart !== undefined && credits.periodEnd !== undefined
                  ? h(Text, { dimColor: true }, `period ${shortDate(credits.periodStart)} → ${shortDate(credits.periodEnd)}`)
                  : null,
                credits.packCredits > 0
                  ? h(
                      Text,
                      { dimColor: true },
                      `pack +${formatCredits(credits.packCredits)}${credits.packExpiresAt === undefined ? '' : ` · expires ${shortDate(credits.packExpiresAt)}`}`,
                    )
                  : null,
                credits.frozen ? h(Text, { color: 'error' }, 'account frozen — usage is read-only') : null,
              )
            : h(Text, { dimColor: true }, 'No credit allowance on this plan'),
        ),
        h(
          Box,
          { key: 'window', flexDirection: 'column', width: '100%' },
          h(Divider, { title: `Last ${report.windowDays ?? config.windowDays ?? 30} days` }),
          h(Text, null, `${formatTokens(totals.totalTokens)} tokens · ${formatInteger(totals.apiRequests)} requests`),
          h(Text, { dimColor: true }, `${formatCredits(totals.credits)} credits`),
          models.length > 0 ? tableRow('head', 'model', 'credits', 'tokens', 'req', true) : null,
          ...visibleModels.map(model =>
            tableRow(
              model.model,
              model.model,
              formatCredits(model.credits),
              formatTokens(model.totalTokens),
              formatInteger(model.apiRequests),
            ),
          ),
          models.length > visibleModels.length
            ? h(Text, { dimColor: true }, `… ${models.length - visibleModels.length} more models`)
            : null,
          daily.length > 0 ? h(Text, { dimColor: true, wrap: 'truncate-end' }, `daily ${sparkline(daily, sparkWidth)}`) : null,
        ),
      )

      if (report.allTime !== undefined) {
        body.push(
          h(
            Box,
            { key: 'alltime', flexDirection: 'column', width: '100%' },
            h(Divider, { title: 'All time' }),
            h(
              Text,
              null,
              `${formatTokens(report.allTime.totalTokens)} tokens · ${formatInteger(report.allTime.apiRequests)} requests`,
            ),
            report.allTime.cachedAt !== undefined
              ? h(Text, { dimColor: true }, `data updated ${timeAgo(report.allTime.cachedAt)}`)
              : null,
          ),
        )
      }
    }

    const footer = report !== undefined
      ? `synced ${timeAgo(report.fetchedAt)}${state.phase === 'refreshing' ? ' · refreshing…' : ''}${focused ? ' · r refresh' : ''}`
      : 'api.nan.builders'

    return h(
      Box,
      { flexDirection: 'column', width, height, flexShrink: 0, paddingX: 1 },
      h(
        Box,
        { key: 'title', flexDirection: 'row', width: '100%', flexShrink: 0 },
        h(Text, { bold: true, color: 'accent' }, 'NaN usage'),
      ),
      h(
        ScrollBox,
        { key: 'scroll', flexDirection: 'column', flexGrow: 1, maxHeight: Math.max(3, height - 2) },
        body,
      ),
      h(Text, { key: 'footer', dimColor: true, wrap: 'truncate-end', flexShrink: 0 }, footer),
    )
  }
}
