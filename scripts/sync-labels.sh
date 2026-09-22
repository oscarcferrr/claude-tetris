#!/usr/bin/env bash
#
# Creates or updates repo labels from a JSON taxonomy file.
# Runs as a plain workflow step (not something Claude invokes) using the
# workflow's own GH_TOKEN/GH_REPO. Idempotent: never deletes labels that
# aren't in the file, so manually-created labels are left alone.
#
# Usage: ./scripts/sync-labels.sh .github/labels.json
#

set -euo pipefail

FILE="${1:?Usage: sync-labels.sh <path-to-labels.json>}"

if [[ -z "${GH_REPO:-${GITHUB_REPOSITORY:-}}" ]]; then
  echo "Error: GH_REPO or GITHUB_REPOSITORY must be set" >&2
  exit 1
fi
export GH_REPO="${GH_REPO:-$GITHUB_REPOSITORY}"

jq -c '.[]' "$FILE" | while IFS= read -r row; do
  name=$(jq -r '.name' <<<"$row")
  color=$(jq -r '.color' <<<"$row")
  description=$(jq -r '.description' <<<"$row")

  if gh label create "$name" --color "$color" --description "$description" --force >/dev/null 2>&1; then
    echo "Synced: $name"
  else
    echo "Warning: failed to sync label '$name'" >&2
  fi
done
