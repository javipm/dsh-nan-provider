import test from 'node:test'
import assert from 'node:assert/strict'

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
} from '../lib/format.js'

test('numbers format the way the panel and report need them', () => {
  assert.equal(formatCredits(6_266.3), '6,266.3')
  assert.equal(formatCredits(7_000), '7,000')
  assert.equal(formatCredits(Number.NaN), '—')
  assert.equal(formatInteger(26_446), '26,446')

  assert.equal(formatTokens(5_758_466_019), '5.76B')
  assert.equal(formatTokens(175_173_138), '175.2M')
  assert.equal(formatTokens(26_400), '26.4k')
  assert.equal(formatTokens(980), '980')
  assert.equal(formatTokens(Number.POSITIVE_INFINITY), '—')

  assert.equal(formatPercent(0.105), '10.5%')
})

test('progressBar clamps to 0..1 and keeps its width', () => {
  assert.equal(progressBar(0, 10), '░░░░░░░░░░')
  assert.equal(progressBar(1, 10), '██████████')
  assert.equal(progressBar(0.5, 10), '█████░░░░░')
  assert.equal(progressBar(2, 6), '██████')
  assert.equal(progressBar(Number.NaN, 6), '░░░░░░')
})

test('sparkline maps values onto braille-like levels', () => {
  assert.equal(sparkline([], 10), '')
  assert.equal(sparkline([0, 0, 0], 3), '▁▁▁')
  assert.equal(sparkline([0, 8], 2), '▁█')
  assert.equal(sparkline([1, 2, 3, 4, 5, 6, 7, 8], 4), '▅▆▇█')
})

test('dates and durations are stable in UTC', () => {
  assert.equal(shortDate('2026-11-26T05:29:21Z'), '26 Nov')
  assert.equal(shortDate('planned'), '—')
  assert.equal(daysUntil('2026-11-26T05:29:21Z', Date.parse('2026-11-12T05:29:21Z')), 14)
  assert.equal(daysUntil('2026-11-01T00:00:00Z', Date.parse('2026-11-12T00:00:00Z')), 0)

  const now = Date.parse('2026-11-12T12:00:00Z')
  assert.equal(timeAgo('2026-11-12T11:59:40Z', now), 'just now')
  assert.equal(timeAgo('2026-11-12T11:57:00Z', now), '3m ago')
  assert.equal(timeAgo('2026-11-12T09:00:00Z', now), '3h ago')
  assert.equal(timeAgo('2026-11-07T12:00:00Z', now), '5d ago')
})

test('truncateCells keeps the cell budget', () => {
  assert.equal(truncateCells('deepseek-v4-flash', 10), 'deepseek-…')
  assert.equal(truncateCells('short', 10), 'short')
  assert.equal(truncateCells('abc', 1), '…')
})
