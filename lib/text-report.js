import {
  formatCredits,
  formatInteger,
  formatPercent,
  formatTokens,
  shortDate,
  timeAgo,
} from './format.js'

/** One-line human reason for a failed usage query. */
export function describeError(result, config = {}) {
  const base = String(config.baseUrl ?? 'https://api.nan.builders/v1').replace(/^https?:\/\//u, '')
  switch (result?.reason) {
    case 'no-provider':
      return 'No NaN provider configured — run /nan-setup first'
    case 'no-key':
      return `No API key — set the ${config.apiKeyEnv ?? 'NAN_API_KEY'} credential for this profile`
    case 'unauthorized':
      return `API key rejected (HTTP ${result.status ?? 401}) — check it in the NaN platform`
    case 'rate-limit':
      return result.retryAfter !== undefined
        ? `Rate limited — retry in ${result.retryAfter}s`
        : 'Rate limited — retry in a minute'
    case 'timeout':
      return `Request to ${base} timed out`
    case 'network':
      return `Cannot reach ${base}`
    case 'http':
      return `Usage endpoint answered HTTP ${result.status ?? '?'}`
    case 'invalid':
      return 'Unexpected response from the usage endpoint'
    default:
      return result?.detail !== undefined ? String(result.detail) : 'Usage query failed'
  }
}

/** Credits ratio tone shared by the panel and the footer. */
export function usageTone(credits) {
  if (credits === undefined) return undefined
  if (credits.frozen) return 'error'
  if (credits.allowance <= 0) return undefined
  const ratio = credits.used / credits.allowance
  if (ratio >= 0.9) return 'error'
  if (ratio >= 0.7) return 'warning'
  return 'success'
}

/** Compact multi-line report returned by `/nan-usage text`. */
export function usageText(report) {
  const { credits, totals, allTime } = report
  const lines = []
  const ratio = credits.allowance > 0 ? credits.used / credits.allowance : undefined
  lines.push(
    `NaN usage · ${formatCredits(credits.used)}/${formatCredits(credits.allowance)} credits used` +
      `${ratio === undefined ? '' : ` (${formatPercent(ratio)})`} · ${formatCredits(credits.remaining)} left`,
  )
  if (credits.periodStart !== undefined && credits.periodEnd !== undefined) {
    lines.push(`Period ${shortDate(credits.periodStart)} → ${shortDate(credits.periodEnd)}${credits.frozen ? ' · FROZEN' : ''}`)
  }
  lines.push(
    `Last ${report.windowDays ?? 30} days: ${formatTokens(totals.totalTokens)} tokens · ` +
      `${formatInteger(totals.apiRequests)} requests · ${formatCredits(totals.credits)} credits`,
  )
  const models = [...totals.byModel].sort((a, b) => b.credits - a.credits).slice(0, 5)
  for (const model of models) {
    lines.push(`  ${model.model}  ${formatCredits(model.credits)} credits · ${formatTokens(model.totalTokens)} tokens`)
  }
  if (totals.byModel.length > models.length) lines.push(`  … ${totals.byModel.length - models.length} more models`)
  if (allTime !== undefined) {
    lines.push(`All time: ${formatTokens(allTime.totalTokens)} tokens · ${formatInteger(allTime.apiRequests)} requests`)
    if (allTime.cachedAt !== undefined) lines.push(`Usage data updated ${timeAgo(allTime.cachedAt)}`)
  }
  return lines.join('\n')
}
