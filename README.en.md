# dsh-nan-usage

NaN ([nan.builders](https://nan.builders)) subscription usage inside the DeepSeek
Harness TUI: billing-period credits, 30-day token spend and a per-model
breakdown, right in the sidebar.

🇬🇧 **English** · 🇪🇸 [Español](README.md)

<p align="center">
  <img src="docs/panel.jpg" alt="The NaN usage panel and the credits chip in the footer" width="900">
</p>

## What it adds

- **“NaN usage” sidebar tab** next to Info / Todo / Jobs (`◈` icon). Open it with
  `/usage` or by clicking the icon:
  - credit bar and percentage for the current billing period,
  - credits left, days left and pack credits,
  - last 30 days: tokens, requests, credits and the top models,
  - daily credits sparkline and all-time totals.
- **`/usage`** opens the tab (no request spent if the panel is already loaded).
- **`/usage text`** returns the compact report in chat; it is also the fallback
  on hosts without panels.
- **`r`** inside the panel refreshes (20 s cache, respecting the endpoint’s
  30 requests/minute limit).
- **Footer chip** with the remaining credits (`NaN 6,195 cr · 14d`) on the host’s
  status row; hovering it shows used/left/period. `footer: false` turns it off.

> The built-in Info panel is host code with fixed sections; plugins cannot
> inject rows into it. A dedicated tab is the supported route. The footer chip
> joins the host’s existing status row — dsh-tui has no plugin seam for an extra
> footer line — and sits after the cwd. If the host ever exposes a section/footer
> API, the data layer can move without changes.

## Install

```bash
dsh plugin --profile dsh-tui add dsh-nan-usage
```

From source:

```bash
git clone https://github.com/javipm/dsh-nan-usage.git
dsh plugin --profile dsh-tui add ./dsh-nan-usage
```

Then restart the TUI with `/restart` (or exit and reopen it). The install is a
`link:` dependency, so edits in this directory show up after a restart without
reinstalling.

## API key

It uses the same credential ref as the profile’s NaN provider:

1. `credentials.resolve('OPENAI_API_KEY')` from the harness credential store
   (`~/.dsh/.credentials.yaml`), then
2. the `OPENAI_API_KEY` environment variable.

Configurable with `apiKeyEnv`. The credentials file is never read directly.

The endpoint is `GET https://api.nan.builders/v1/usage` (documented in
`https://nan.builders/openapi.json`). It is a billing query and does not consume
credits.

## Configuration

Everything is optional. Set it on the `nan-usage` row of
`~/.dsh/profiles/dsh-tui/cordis.patch.yml`:

| key | default | what it does |
| --- | --- | --- |
| `apiKeyEnv` | `OPENAI_API_KEY` | credential ref / env var |
| `baseUrl` | `https://api.nan.builders/v1` | API base |
| `windowDays` | `30` | breakdown window (1–90; the API rejects wider) |
| `autoRefreshSeconds` | `60` | auto-refresh while the panel is visible (`0` = off) |
| `lowCreditsPercent` | `10` | `warning`/`error` badge threshold |
| `commandName` | `usage` | command name |
| `panelId` | `usage` | internal panel id |
| `panelTitle` | `NaN usage` | tab title |
| `footer` | `true` | footer chip with credits left (`false` disables it) |
| `footerRefreshMinutes` | `15` | footer refresh interval |
| `cacheSeconds` | `20` | shared panel/command cache |

Example:

```yaml
- id: nan-usage
  name: 'dsh-nan-usage'
  config:
    windowDays: 30
    autoRefreshSeconds: 120
    footer: true
```

## Development

```bash
npm install --include=dev   # NODE_ENV=production skips devDependencies otherwise
npm test                    # 19 tests; the 3 render tests use react-test-renderer
```

No runtime dependencies: only `fetch` and the harness credential service. The
panel renders with the host’s React and `ui` kit (single-React rule) and uses
`ui.useAnimationTime` as its clock, not private timers.

## Layout

```text
lib/index.js        panel, /usage and footer wiring (cordis inject)
lib/api.js          /usage client + defensive normalization
lib/source.js       shared cache and key resolution
lib/panel.js        panel React component (no JSX, host React)
lib/format.js       numbers, bars, sparkline, dates (pure)
lib/text-report.js  text report and error messages
cordis.patch.yml    row that mounts the bundle in the profile
dsh-plugin.json     0.15 manifest (ecosystem metadata)
```
