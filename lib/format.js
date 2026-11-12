/**
 * Pure display helpers for the NaN usage panel and the text report.
 * No TUI imports: these are covered by `node --test`.
 */

const creditsFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const percentFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** `6266.3` → `6,266.3`; `7000` → `7,000`; non-finite → `—`. */
export function formatCredits(value) {
  return Number.isFinite(value) ? creditsFormatter.format(value) : '—'
}

/** `26446` → `26,446`; non-finite → `—`. */
export function formatInteger(value) {
  return Number.isFinite(value) ? integerFormatter.format(value) : '—'
}

/** Compact token counts: `5.76B`, `175.2M`, `26.4k`, `980`. */
export function formatTokens(value) {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${compact(value / 1e9)}B`
  if (abs >= 1e6) return `${compact(value / 1e6)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/u, '')}k`
  return integerFormatter.format(value)
}

function compact(scaled) {
  const digits = Math.abs(scaled) >= 10 ? 1 : 2
  const fixed = scaled.toFixed(digits)
  return fixed.includes('.') ? fixed.replace(/0+$/u, '').replace(/\.$/u, '') : fixed
}

/** `0.105` (a ratio) → `10.5%`. */
export function formatPercent(ratio) {
  return Number.isFinite(ratio) ? `${percentFormatter.format(ratio * 100)}%` : '—'
}

/** A solid/empty bar: `████████░░░░░░░░░░░░`. */
export function progressBar(ratio, width = 18) {
  const cells = Math.max(1, Math.trunc(width))
  const clamped = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0
  const filled = Math.round(clamped * cells)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, cells - filled))
}

const SPARK_LEVELS = '▁▂▃▄▅▆▇█'

/** Unicode sparkline of the last `width` values; zero-max flattens to `▁`. */
export function sparkline(values, width = 24) {
  if (!Array.isArray(values) || values.length === 0) return ''
  const slice = values.slice(-Math.max(1, Math.trunc(width)))
  const max = Math.max(...slice.map(value => (Number.isFinite(value) ? value : 0)))
  return slice
    .map(value => {
      const safe = Number.isFinite(value) ? Math.max(value, 0) : 0
      if (max <= 0) return SPARK_LEVELS[0]
      const level = Math.min(SPARK_LEVELS.length - 1, Math.max(0, Math.round((safe / max) * (SPARK_LEVELS.length - 1))))
      return SPARK_LEVELS[level]
    })
    .join('')
}

/** `2026-11-26T05:29:21Z` → `26 Nov` (UTC, English month). */
export function shortDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Whole days from `now` until an ISO timestamp; 0 when already past. */
export function daysUntil(value, now = Date.now()) {
  const target = Date.parse(value)
  if (!Number.isFinite(target)) return undefined
  return Math.max(0, Math.ceil((target - now) / 86_400_000))
}

/** `just now`, `3m ago`, `2h ago`, `5d ago`. */
export function timeAgo(value, now = Date.now()) {
  const target = Date.parse(value)
  if (!Number.isFinite(target)) return '—'
  const diff = Math.max(0, now - target)
  if (diff < 45_000) return 'just now'
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`
  return `${Math.max(1, Math.round(diff / 86_400_000))}d ago`
}

/** Truncate to `cells` visible characters, ending with `…`. */
export function truncateCells(value, cells) {
  const chars = Array.from(String(value ?? ''))
  if (chars.length <= cells) return String(value ?? '')
  if (cells <= 1) return '…'
  return `${chars.slice(0, cells - 1).join('')}…`
}
