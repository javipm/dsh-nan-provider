# dsh-nan

Set up and watch your **NaN** ([nan.builders](https://nan.builders))
subscription inside the DeepSeek Harness TUI: creates the provider, stores the
key, sets the default model and shows credits and spend in the sidebar.

🇬🇧 **English** · 🇪🇸 [Español](README.md)

<p align="center">
  <img src="docs/panel.jpg" alt="The NaN usage panel and the credits chip in the footer" width="900">
</p>

## What it does

- **`/nan-setup`**: creates the `nan` provider with the 11 catalog models
  (endpoint, compat, retries), checks the key and sets `deepseek-v4-flash` as
  the default model. It never deletes `openai` or hand-edits the YAML: it writes
  through the settings service, exactly like `/provider`.
- **“NaN usage” sidebar tab** next to Info / Todo / Jobs (`◈` icon): billing
  period credit bar, credits left and days, last 30 days with top models, daily
  sparkline and all-time totals.
- **`/usage`** opens the tab; **`/usage text`** returns the report in chat.
- **Footer chip** (`NaN 6,195 cr · 14d`) on the status row, with the full
  breakdown on hover. `footer: false` turns it off.

> The built-in Info panel is host code with fixed sections; a dedicated tab is
> the supported route. The chip joins the existing status row because there is
> no seam for an extra footer line.

## Install

```bash
dsh plugin --profile dsh-tui add dsh-nan
```

## Getting started

1. `/nan-setup` — creates the provider and sets the default model.
2. If there was no key: `/login` (or Settings → Providers) to store the NaN one.
3. `/restart` to mount the route.
4. `/usage` (or the `◈` tab) to see usage.

Setup is idempotent: an existing `nan` route is left untouched and only the key
and default model are checked.

## API key

The plugin finds the provider by id `nan`, by a `nan.builders` `baseURL` or by a
“NaN” label, then uses its `apiKeyEnv` (and `baseURL`) for the `/usage` call.
Without a provider it falls back to `OPENAI_API_KEY` and
`https://api.nan.builders/v1`.

The key is resolved per operation from the harness credential store
(`~/.dsh/.credentials.yaml`) and, failing that, from the environment variable.
The file is never read directly.

The endpoint is `GET {baseURL}/usage` (documented in
`https://nan.builders/openapi.json`); it does not consume credits.

## Configuration

Optional; set it on the `nan` row of
`~/.dsh/profiles/dsh-tui/cordis.patch.yml`:

| key | default | what it does |
| --- | --- | --- |
| `provider` | `nan` | route id detected and configured |
| `apiKeyEnv` | `OPENAI_API_KEY` | fallback credential ref |
| `baseUrl` | `https://api.nan.builders/v1` | fallback API base |
| `windowDays` | `30` | breakdown window (1–90) |
| `autoRefreshSeconds` | `60` | refresh while visible (`0` = off) |
| `lowCreditsPercent` | `10` | `warning`/`error` badge threshold |
| `commandName` | `usage` | usage command name |
| `panelId` | `usage` | internal panel id |
| `panelTitle` | `NaN usage` | tab title |
| `footer` | `true` | footer credits chip |
| `footerRefreshMinutes` | `15` | chip refresh interval |
| `cacheSeconds` | `20` | shared panel/command cache |
| `setupModel` | `deepseek-v4-flash` | model `/nan-setup` selects |
| `setupEffort` | `max` | effort `/nan-setup` selects |

## Development

```bash
npm install --include=dev   # NODE_ENV=production skips devDependencies otherwise
npm test                    # 30 tests; the 3 render tests use react-test-renderer
```

No runtime dependencies: only `fetch` and the harness services. The panel uses
the host’s React and `ui` kit (single-React rule) and `ui.useAnimationTime` as
its clock.

## Layout

```text
lib/index.js        panel, /usage, /nan-setup and footer (cordis inject)
lib/catalog.js      canonical NaN provider profile (11 models)
lib/provider.js     nan route detection (settings)
lib/setup.js        /nan-setup: provider + key + default model
lib/api.js          /usage client + defensive normalization
lib/source.js       shared cache and route/key resolution
lib/panel.js        panel React component (no JSX, host React)
lib/format.js       numbers, bars, sparkline, dates (pure)
lib/text-report.js  text report and error messages
cordis.patch.yml    row that mounts the bundle in the profile
dsh-plugin.json     0.15 manifest (ecosystem metadata)
```
