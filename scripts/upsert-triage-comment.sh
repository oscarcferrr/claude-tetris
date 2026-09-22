#!/usr/bin/env bash
#
# Creates or updates the sticky triage comment on the triggering issue.
# The issue number is read from the workflow event payload (never from an
# argument), so it cannot be redirected to another issue.
#
# On each run it looks for an existing comment that starts with the
# <!-- claude-triage:v1 --> marker and PATCHes it; otherwise it creates a
# new comment. This keeps exactly one diagnosis comment per issue even
# across repeated edits.
#
# Usage: ./scripts/upsert-triage-comment.sh --body-file triage-body.md
#

set -euo pipefail

MARKER="<!-- claude-triage:v1 -->"

REPO="${GH_REPO:-${GITHUB_REPOSITORY:-}}"
if [[ -z "$REPO" || "$REPO" != */* ]]; then
  echo "Error: GH_REPO or GITHUB_REPOSITORY must be set to owner/repo format" >&2
  exit 1
fi

ISSUE=$(jq -r '.issue.number // empty' "${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH not set}")
if ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Error: no issue number in event payload" >&2
  exit 1
fi

BODY_FILE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --body-file)
      BODY_FILE="$2"
      shift 2
      ;;
    *)
      echo "Error: unknown argument (only --body-file is accepted)" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$BODY_FILE" || ! -f "$BODY_FILE" ]]; then
  echo "Error: --body-file must point to an existing file" >&2
  exit 1
fi

STAMP="_Actualizado: $(date -u +"%Y-%m-%d %H:%M UTC") · run ${GITHUB_RUN_ID:-local}_"
FULL_BODY_FILE=$(mktemp)
trap 'rm -f "$FULL_BODY_FILE"' EXIT

{
  echo "$MARKER"
  cat "$BODY_FILE"
  echo
  echo "---"
  echo "$STAMP"
} > "$FULL_BODY_FILE"

EXISTING_ID=$(gh api "repos/${REPO}/issues/${ISSUE}/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"${MARKER}\"))][0].id // empty")

if [[ -n "$EXISTING_ID" ]]; then
  gh api --method PATCH "repos/${REPO}/issues/comments/${EXISTING_ID}" \
    -f body=@"$FULL_BODY_FILE" >/dev/null
  echo "Updated triage comment #${EXISTING_ID} on issue #${ISSUE}"
else
  gh issue comment "$ISSUE" --repo "$REPO" --body-file "$FULL_BODY_FILE"
  echo "Created triage comment on issue #${ISSUE}"
fi
