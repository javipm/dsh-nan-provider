# Contributing to dsh-nan-provider

Thanks for taking the time. This plugin configures the NaN provider in DeepSeek
Harness (TUI and Desktop) and shows subscription usage. Small, focused changes
with tests are the easiest to merge.

## Before you start

- Open an issue for anything larger than a bug fix or a doc tweak, so the
  approach can be agreed first.
- Never paste API keys, tokens or account data in issues, PRs or logs.
- Account, credits and billing questions belong to NaN
  (https://nan.builders/docs), not to this plugin.

## Development

```bash
npm install --include=dev   # NODE_ENV=production skips devDependencies
npm test                    # node --test
npm run check               # syntax + tests + npm pack --dry-run
```

Rules of the project (also in `AGENTS.md`):

1. **No runtime dependencies.** Only `fetch` and harness services.
2. **Never read the credentials file.** Always `ctx.get('credentials')`.
3. **No invented capabilities.** Numbers come from the catalog, from
   `nan-cli` or from a measured override with a provenance note.
4. **Idempotent writes.** `/nan-setup` must not delete other providers or the
   models a user added.
5. **Single-React rule** for TUI components: use the host's `React` and `ui`.

## Pull requests

1. Fork, create a branch (`feat/...`, `fix/...`, `docs/...`).
2. Add or update tests under `test/`.
3. Keep the docs in sync: `README.md` (es), `README.en.md`, `AGENTS.md`.
4. Run `npm run check`.
5. Open the PR using the template and say which surface you tested (TUI and/or
   Desktop) and the DSH version.

## Commit style

Short imperative subject, body when the reason is not obvious. One logical
change per commit.
