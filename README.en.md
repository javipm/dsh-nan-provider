# dsh-nan-provider

Set up and watch your **NaN** ([nan.builders](https://nan.builders))
subscription inside the DeepSeek Harness TUI: creates the provider, stores the
key, sets the default model and shows credits and spend in the sidebar. Based on
the idea of [pi-nan-provider](https://github.com/gtrabanco/pi-nan-provider).

🇬🇧 **English** · 🇪🇸 [Español](README.md)

<p align="center">
  <img src="docs/panel.jpg" alt="The NaN usage panel and the credits chip in the footer" width="900">
</p>

## What it does

- **`/nan-setup`**: creates or refreshes the `nan` provider. It asks for the key
  when missing (and stores it), fetches `{baseURL}/models`, merges it with the
  catalog —new chat models get conservative defaults; embeddings, rerank, STT,
  TTS and image models are filtered out— and sets `deepseek-v4-flash` as the
  default model. It never deletes `openai` or hand-edits the YAML: it writes
  through the settings service, exactly like `/provider`.
- **“NaN usage” sidebar tab** next to Info / Todo / Jobs (`◈` icon): billing
  period credit bar, credits left and days, last 30 days with top models, daily
  sparkline and all-time totals.
- **`/nan-usage`** opens the tab; **`/nan-usage text`** returns the report in chat.
- **Footer chip** (`NaN 6,195 cr · 14d`) on the status row, with the full
  breakdown on hover. `footer: false` turns it off.

> The built-in Info panel is host code with fixed sections; a dedicated tab is
> the supported route. The chip joins the existing status row because there is
> no seam for an extra footer line.

## Install

```bash
dsh plugin --profile dsh-tui add dsh-nan-provider
```

## Getting started

1. `/nan-setup` — creates the provider, asks for/stores the key and sets the model.
2. Run it again whenever you want to refresh the model catalog.
3. `/restart` to mount the route the first time.
4. `/nan-usage` (or the `◈` tab) to see usage.

Setup is idempotent: an existing `nan` route is left untouched and only the key
and default model are checked.

## API key

The plugin finds the provider by id `nan`, by a `nan.builders` `baseURL` or by a
“NaN” label, then uses its `apiKeyEnv` (and `baseURL`) for the `/nan-usage` call.
The key is resolved per operation from the harness credential store
(`~/.dsh/.credentials.yaml`) and, failing that, from the environment variable.
When neither has it, `/nan-setup` prompts for it (visible while typing) and
stores it. The file is never read directly.

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
npm test                    # 37 tests; the 3 render tests use react-test-renderer
```

No runtime dependencies: only `fetch` and the harness services. The panel uses
the host’s React and `ui` kit (single-React rule) and `ui.useAnimationTime` as
its clock.

## Layout

```text
lib/index.js        panel, /nan-usage, /nan-setup and footer (cordis inject)
lib/catalog.js      canonical NaN provider profile (11 models)
lib/provider.js     nan route detection (settings)
lib/setup.js        /nan-setup: provider + key + default model
lib/overrides.js    measured catalog overrides (pi-nan-provider)
lib/api.js          /usage client + defensive normalization
lib/source.js       shared cache and route/key resolution
lib/panel.js        panel React component (no JSX, host React)
lib/format.js       numbers, bars, sparkline, dates (pure)
lib/text-report.js  text report and error messages
cordis.patch.yml    row that mounts the bundle in the profile
dsh-plugin.json     0.15 manifest (ecosystem metadata)
```

## Credits

The idea of generating the catalog from a public source and correcting it with
measured overrides — plus the non-chat endpoint filtering — comes from
[pi-nan-provider](https://github.com/gtrabanco/pi-nan-provider) (MIT). The values
and provenance notes in `lib/overrides.js` come from its
`scripts/manual-overrides.ts`.

Live models the endpoint announces without metadata get pi-nan-provider's
conservative envelope: 128k context, 4k output, text only, no adjustable
reasoning. Capabilities are never invented.
