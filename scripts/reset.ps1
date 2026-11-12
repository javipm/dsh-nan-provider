# reset.ps1 — start DeepSeek Harness from scratch (config + credentials only).
#
# Windows counterpart of scripts/reset.sh: removes the provider configuration of
# the dsh-tui and desktop profiles, the stored credentials and the shared NaN
# profile. Chat history and workspaces are NEVER touched.
#
# Usage:
#   pwsh -File .\scripts\reset.ps1            # asks for confirmation
#   pwsh -File .\scripts\reset.ps1 -DryRun    # only prints what it would delete
#   pwsh -File .\scripts\reset.ps1 -Yes       # no prompt
#
# Environment: DSH_HOME (default %USERPROFILE%\.dsh),
#              DSH_TUI_HOME (default %USERPROFILE%\.dsh-tui)

param(
  [switch]$DryRun,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$tuiHome = if ($env:DSH_TUI_HOME) { $env:DSH_TUI_HOME } else { Join-Path $env:USERPROFILE '.dsh-tui' }

$entries = @(
  @{ Label = 'credentials.yaml';          Path = Join-Path $dshHome '.credentials.yaml' },
  @{ Label = 'nan-provider.json';         Path = Join-Path $dshHome 'nan-provider.json' },
  @{ Label = 'dsh-tui-cordis.patch.yml';  Path = Join-Path $dshHome 'profiles\dsh-tui\cordis.patch.yml' },
  @{ Label = 'desktop-cordis.patch.yml';  Path = Join-Path $dshHome 'profiles\desktop\cordis.patch.yml' },
  @{ Label = 'dsh-tui-model.json';        Path = Join-Path $tuiHome 'model.json' },
  @{ Label = 'dsh-tui-model-recents.json'; Path = Join-Path $tuiHome 'model-recents.json' },
  @{ Label = 'dsh-tui-effort.json';       Path = Join-Path $tuiHome 'effort.json' },
  @{ Label = 'dsh-tui-permission.json';   Path = Join-Path $tuiHome 'permission.json' }
)

$kept = @(
  (Join-Path $dshHome 'sessions'),
  (Join-Path $dshHome 'attachments'),
  (Join-Path $dshHome 'storages'),
  (Join-Path $tuiHome 'history.jsonl'),
  (Join-Path $tuiHome 'session-index.json'),
  (Join-Path $tuiHome 'session-lists')
)

Write-Host "DSH_HOME     : $dshHome"
Write-Host "DSH_TUI_HOME : $tuiHome"
Write-Host ""
Write-Host "Will remove:"
foreach ($entry in $entries) {
  if (Test-Path -LiteralPath $entry.Path) { Write-Host "  - $($entry.Path)" }
}
Write-Host ""
Write-Host "Will keep (chat history and workspaces):"
foreach ($path in $kept) {
  if (Test-Path -LiteralPath $path) { Write-Host "  + $path" }
}
Write-Host ""

if ($DryRun) {
  Write-Host "Dry run: nothing was deleted."
  exit 0
}

if (-not $Yes) {
  $answer = Read-Host "Continue? [y/N]"
  if ($answer -notmatch '^(y|yes)$') {
    Write-Host "Aborted."
    exit 1
  }
}

$backupDir = Join-Path $env:USERPROFILE ("dsh-backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach ($entry in $entries) {
  if (Test-Path -LiteralPath $entry.Path) {
    Copy-Item -LiteralPath $entry.Path -Destination (Join-Path $backupDir $entry.Label)
  }
}
Write-Host "Backup written to $backupDir"

foreach ($entry in $entries) {
  if (Test-Path -LiteralPath $entry.Path) {
    Remove-Item -LiteralPath $entry.Path -Force
    Write-Host "removed $($entry.Path)"
  }
}

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "  1. Install the plugin in each profile:"
Write-Host "       dsh plugin --profile dsh-tui add dsh-nan-provider"
Write-Host "       Desktop: Settings -> Plugins -> Add plugin -> dsh-nan-provider"
Write-Host "  2. Start the TUI and run /nan-setup (it will ask for the API key)."
Write-Host "  3. Open Desktop: the shared profile syncs automatically."
