#!/usr/bin/env bash
#
# Read-only wrapper around `gh` for the issue-triage workflow. Only allows
# a fixed set of subcommands/flags, and always scopes to the current repo
# via GH_REPO/GITHUB_REPOSITORY, so Claude cannot act on another repo or
# perform any write operation through this script.
#
# Usage:
#   ./scripts/gh-read.sh issue view 123
#   ./scripts/gh-read.sh issue view 123 --comments
#   ./scripts/gh-read.sh issue list --state open --limit 20
#   ./scripts/gh-read.sh search issues "query" --limit 10
#   ./scripts/gh-read.sh label list
#

set -euo pipefail

export GH_HOST=github.com

REPO="${GH_REPO:-${GITHUB_REPOSITORY:-}}"
if [[ -z "$REPO" || "$REPO" != */* || "$REPO" == */*/* ]]; then
  echo "Error: GH_REPO or GITHUB_REPOSITORY must be set to owner/repo format" >&2
  exit 1
fi
export GH_REPO="$REPO"

ALLOWED_FLAGS=(--comments --state --limit --label --json --jq)
FLAGS_WITH_VALUES=(--state --limit --label --json --jq)

SUB1="${1:-}"
SUB2="${2:-}"
CMD="$SUB1 $SUB2"
case "$CMD" in
  "issue view"|"issue list"|"search issues"|"label list")
    ;;
  *)
    echo "Error: only 'issue view', 'issue list', 'search issues', 'label list' are allowed" >&2
    exit 1
    ;;
esac
shift 2

POSITIONAL=()
FLAGS=()
skip_next=false
for arg in "$@"; do
  if [[ "$skip_next" == true ]]; then
    FLAGS+=("$arg")
    skip_next=false
  elif [[ "$arg" == -* ]]; then
    flag="${arg%%=*}"
    matched=false
    for allowed in "${ALLOWED_FLAGS[@]}"; do
      if [[ "$flag" == "$allowed" ]]; then
        matched=true
        break
      fi
    done
    if [[ "$matched" == false ]]; then
      echo "Error: only --comments, --state, --limit, --label, --json, --jq flags are allowed" >&2
      exit 1
    fi
    FLAGS+=("$arg")
    if [[ "$arg" != *=* ]]; then
      for vflag in "${FLAGS_WITH_VALUES[@]}"; do
        if [[ "$flag" == "$vflag" ]]; then
          skip_next=true
          break
        fi
      done
    fi
  else
    POSITIONAL+=("$arg")
  fi
done

if [[ "$CMD" == "search issues" ]]; then
  QUERY="${POSITIONAL[0]:-}"
  QUERY_LOWER=$(echo "$QUERY" | tr '[:upper:]' '[:lower:]')
  if [[ "$QUERY_LOWER" == *"repo:"* || "$QUERY_LOWER" == *"org:"* || "$QUERY_LOWER" == *"user:"* ]]; then
    echo "Error: search query must not contain repo:, org:, or user: qualifiers" >&2
    exit 1
  fi
  gh "$SUB1" "$SUB2" "$QUERY" --repo "$REPO" "${FLAGS[@]}"
elif [[ "$CMD" == "issue view" ]]; then
  if [[ ${#POSITIONAL[@]} -ne 1 ]] || ! [[ "${POSITIONAL[0]}" =~ ^[0-9]+$ ]]; then
    echo "Error: issue view requires exactly one numeric issue number" >&2
    exit 1
  fi
  gh "$SUB1" "$SUB2" "${POSITIONAL[0]}" "${FLAGS[@]}"
else
  if [[ ${#POSITIONAL[@]} -ne 0 ]]; then
    echo "Error: issue list and label list do not accept positional arguments" >&2
    exit 1
  fi
  gh "$SUB1" "$SUB2" "${FLAGS[@]}"
fi
