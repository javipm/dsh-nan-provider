/**
 * Browser half: the "NaN" card in Settings (web / Desktop).
 *
 * Built as a hand-written client module (no bundler): the web shell loads it
 * through `window.__ModuleLoader__`, gives it `react` and `@deepseek-ai/cordis`
 * from its baseline table, and activates the exported plugin. The card only
 * talks to the host route `/api/nan-provider/usage`; it never sees the API key.
 */
if (typeof window !== 'undefined' && window.__ModuleLoader__ !== undefined) {
  window.__ModuleLoader__.load({
    id: 'dsh-nan-provider',
    factory: require => {
      const React = require('react')
      const h = React.createElement

      const ENDPOINT = '/api/nan-provider/usage'

      async function fetchUsage() {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        const payload = await response.json().catch(() => undefined)
        if (payload === undefined) return { ok: false, message: `HTTP ${response.status}` }
        return payload
      }

      const number = value =>
        typeof value === 'number' && Number.isFinite(value)
          ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
          : '—'

      const tokens = value => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
        if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
        if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
        if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
        return String(value)
      }

      const shortDate = value => {
        const date = new Date(value)
        return Number.isNaN(date.getTime())
          ? '—'
          : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      }

      const daysUntil = value => {
        const target = Date.parse(value)
        if (!Number.isFinite(target)) return undefined
        return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000))
      }

      const muted = { color: 'var(--dsh-text-secondary, #8b93a7)', fontSize: 13 }
      const row = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }
      const card = { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }

      function Bar({ ratio }) {
        const clamped = Math.min(Math.max(ratio, 0), 1)
        return h(
          'div',
          {
            style: {
              height: 8,
              borderRadius: 999,
              background: 'var(--dsh-surface-sunken, rgba(127,127,127,0.2))',
              overflow: 'hidden',
            },
          },
          h('div', {
            style: {
              width: `${clamped * 100}%`,
              height: '100%',
              background: clamped >= 0.9 ? '#e5534b' : clamped >= 0.7 ? '#d29922' : 'var(--dsh-accent, #4e6fff)',
            },
          }),
        )
      }

      function NanUsageSection() {
        const [state, setState] = React.useState({ phase: 'loading' })
        const load = React.useCallback(async () => {
          setState(previous => ({ phase: previous.report === undefined ? 'loading' : 'refreshing', report: previous.report }))
          const result = await fetchUsage()
          setState({ phase: result.ok ? 'ready' : 'error', report: result.report, error: result })
        }, [])
        React.useEffect(() => {
          void load()
        }, [load])

        const report = state.report
        const credits = report?.credits
        const ratio = credits !== undefined && credits.allowance > 0 ? credits.used / credits.allowance : undefined
        const leftDays = credits?.periodEnd === undefined ? undefined : daysUntil(credits.periodEnd)

        const header = h(
          'div',
          { style: { ...row, alignItems: 'center' } },
          h('div', { style: { fontSize: 18, fontWeight: 600 } }, 'NaN usage'),
          h(
            'button',
            {
              type: 'button',
              onClick: () => void load(),
              disabled: state.phase === 'loading' || state.phase === 'refreshing',
              style: { cursor: 'pointer' },
            },
            state.phase === 'refreshing' ? 'Refreshing…' : 'Refresh',
          ),
        )

        if (report === undefined) {
          return h(
            'div',
            { style: card },
            header,
            h('div', { style: muted }, state.phase === 'loading' ? 'Querying api.nan.builders…' : state.error?.message ?? 'Usage unavailable'),
          )
        }

        const models = Array.isArray(report.totals?.byModel) ? [...report.totals.byModel].sort((a, b) => b.credits - a.credits).slice(0, 8) : []

        return h(
          'div',
          { style: card },
          header,
          state.phase === 'error' ? h('div', { style: { color: '#e5534b', fontSize: 13 } }, state.error?.message ?? 'Refresh failed') : null,
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            h(Bar, { ratio: ratio ?? 0 }),
            h(
              'div',
              { style: row },
              h('span', null, `${number(credits.used)} / ${number(credits.allowance)} credits`),
              h('span', { style: muted }, ratio === undefined ? '' : `${(ratio * 100).toFixed(1)}%`),
            ),
            h(
              'div',
              { style: { ...row, ...muted } },
              h('span', null, `${number(credits.remaining)} left${leftDays === undefined ? '' : ` · ${leftDays}d left`}`),
              h('span', null, `period ${shortDate(credits.periodStart)} → ${shortDate(credits.periodEnd)}`),
            ),
          ),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            h('div', { style: { fontWeight: 600 } }, `Last ${report.windowDays ?? 30} days`),
            h(
              'div',
              { style: muted },
              `${tokens(report.totals?.totalTokens)} tokens · ${number(report.totals?.apiRequests)} requests · ${number(report.totals?.credits)} credits`,
            ),
            models.length > 0
              ? h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 } },
                  models.map(model =>
                    h(
                      'div',
                      { key: model.model, style: { ...row, fontSize: 13 } },
                      h('span', null, model.model),
                      h('span', { style: muted }, `${number(model.credits)} cr · ${tokens(model.totalTokens)} tok`),
                    ),
                  ),
                )
              : null,
          ),
          h(
            'div',
            { style: { ...row, ...muted } },
            h('span', null, report.allTime === undefined ? '' : `All time: ${tokens(report.allTime.totalTokens)} tokens · ${number(report.allTime.apiRequests)} requests`),
            h('span', null, 'NaN · api.nan.builders'),
          ),
        )
      }

      function NanSettingsIcon({ size = 16 } = {}) {
        return h(
          'svg',
          { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true },
          h('circle', { cx: 8, cy: 8, r: 7, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
          h('path', { d: 'M5 11V5l6 6V5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        )
      }

      function NanUsageChip() {
        const [state, setState] = React.useState({ phase: 'loading' })
        const load = React.useCallback(async () => {
          const result = await fetchUsage()
          setState({ phase: result.ok ? 'ready' : 'error', report: result.report, error: result })
        }, [])
        React.useEffect(() => {
          void load()
          const timer = setInterval(() => void load(), 300_000)
          return () => clearInterval(timer)
        }, [load])

        const credits = state.report?.credits
        const leftDays = credits?.periodEnd === undefined ? undefined : daysUntil(credits.periodEnd)
        const label = state.report === undefined
          ? state.phase === 'loading' ? 'NaN …' : 'NaN —'
          : `NaN ${number(credits.remaining)} cr${leftDays === undefined ? '' : ` · ${leftDays}d`}`
        const tone = state.phase === 'error'
          ? '#e5534b'
          : credits !== undefined && credits.allowance > 0 && credits.used / credits.allowance >= 0.9
            ? '#e5534b'
            : undefined
        return h(
          'button',
          {
            type: 'button',
            title: state.report === undefined
              ? state.error?.message ?? 'NaN usage'
              : `${number(credits.used)} / ${number(credits.allowance)} credits used · period ends ${shortDate(credits.periodEnd)}`,
            onClick: () => void load(),
            style: {
              alignSelf: 'flex-start',
              margin: '4px 12px 0',
              padding: '2px 10px',
              borderRadius: 999,
              border: '1px solid var(--dsh-border-subtle, rgba(127,127,127,0.35))',
              background: 'transparent',
              color: tone ?? 'var(--dsh-text-secondary, #8b93a7)',
              fontSize: 12,
              cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
            },
          },
          label,
        )
      }

      const SECTION_ID = 'nan-provider'

      return {
        name: 'nan-provider-client',
        inject: ['slots'],
        apply(ctx) {
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: SECTION_ID,
                order: 16,
                label: () => 'NaN',
                inject: () => ({}),
              },
              NanUsageSection,
            ),
          )
          // Always-visible chip above the composer, the web counterpart of the
          // TUI footer field.
          ctx.slots.inject('conversation.input.dock', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.dock',
                id: 'nan-usage-chip',
                order: 40,
                inject: () => ({}),
              },
              NanUsageChip,
            ),
          )
          ctx.slots.inject('settings.section.icon', () =>
            ctx.slots.register(
              { name: 'settings.section.icon', id: SECTION_ID },
              NanSettingsIcon,
            ),
          )
        },
      }
    },
  })
}
