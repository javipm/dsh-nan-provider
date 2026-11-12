#!/usr/bin/env bash
# reset.sh — start DeepSeek Harness from scratch (config + credentials only).
#
# Removes the provider configuration of the dsh-tui and desktop profiles, the
# stored credentials and the shared NaN profile, so the next boot behaves like
# a fresh install. Chat history and workspaces are NEVER touched.
#
# Usage:
#   ./scripts/reset.sh            # asks for confirmation
#   ./scripts/reset.sh --dry-run  # only prints what it would delete
#   ./scripts/reset.sh --yes      # no prompt (CI / scripts)
#
# Environment:
#   DSH_HOME   harness home (default: ~/.dsh)
#   DSH_TUI_HOME  TUI state dir (default: ~/.dsh-tui)
#
# Works on macOS, Linux and Windows via Git Bash / WSL.

set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
DSH_TUI_HOME="${DSH_TUI_HOME:-$HOME/.dsh-tui}"
DRY_RUN=0
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$HOME/dsh-backup-$timestamp"

# Files removed. Keep every path here explicit; this script must never glob
# over a directory that also holds sessions or history.
config_entries=(
  "credentials.yaml|$DSH_HOME/.credentials.yaml"
  "nan-provider.json|$DSH_HOME/nan-provider.json"
  "dsh-tui-cordis.patch.yml|$DSH_HOME/profiles/dsh-tui/cordis.patch.yml"
  "desktop-cordis.patch.yml|$DSH_HOME/profiles/desktop/cordis.patch.yml"
  "dsh-tui-model.json|$DSH_TUI_HOME/model.json"
  "dsh-tui-model-recents.json|$DSH_TUI_HOME/model-recents.json"
  "dsh-tui-effort.json|$DSH_TUI_HOME/effort.json"
  "dsh-tui-permission.json|$DSH_TUI_HOME/permission.json"
)

kept_files=(
  "$DSH_HOME/sessions/"
  "$DSH_HOME/attachments/"
  "$DSH_HOME/storages/"
  "$DSH_TUI_HOME/history.jsonl"
  "$DSH_TUI_HOME/session-index.json"
  "$DSH_TUI_HOME/session-lists/"
)

echo "DSH_HOME      : $DSH_HOME"
echo "DSH_TUI_HOME  : $DSH_TUI_HOME"
echo

echo "Will remove:"
for entry in "${config_entries[@]}"; do
  file="${entry#*|}"
  if [ -e "$file" ]; then
    echo "  - $file"
  fi
done

echo
echo "Will keep (chat history and workspaces):"
for kept in "${kept_files[@]}"; do
  if [ -e "$kept" ]; then
    echo "  + $kept"
  fi
done
echo

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run: nothing was deleted."
  exit 0
fi

if [ "$ASSUME_YES" -eq 0 ]; then
  printf 'Continue? [y/N] '
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

mkdir -p "$backup_dir"
for entry in "${config_entries[@]}"; do
  label="${entry%%|*}"
  file="${entry#*|}"
  [ -e "$file" ] || continue
  cp "$file" "$backup_dir/$label"
done
echo "Backup written to $backup_dir"

for entry in "${config_entries[@]}"; do
  file="${entry#*|}"
  [ -e "$file" ] || continue
  rm -f "$file"
  echo "removed $file"
done

cat <<'EOF'

Done. Next steps:
  1. Install the plugin in each profile (or keep it if already installed):
       dsh plugin --profile dsh-tui add dsh-nan-provider
       Desktop: Settings -> Plugins -> Add plugin -> dsh-nan-provider
  2. Start the TUI and run /nan-setup (it will ask for the API key).
  3. Open Desktop: the shared profile syncs automatically.
EOF
