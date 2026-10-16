#!/usr/bin/env bash
# Print "true" if a commit on main came from merging a version bump PR,
# otherwise "false".
#
# Usage: scripts/is-bump-pr-commit.sh <sha> [<owner/repo>]
#
# auto-version-bump.yml calls this so merging the bump PR does not reopen it.
# A bump PR is one whose head branch starts with bump-version-, the same rule
# tag-version.yml uses. Asking GitHub which PR the commit belongs to works for
# squash, rebase, and merge commits alike, and never reads the commit message,
# which may quote the bump branch in an ordinary PR's description.
#
# Requires GH_TOKEN with pull-requests: read.
set -euo pipefail

sha="${1:?usage: is-bump-pr-commit.sh <sha> [<owner/repo>]}"
repo="${2:-${GITHUB_REPOSITORY:?pass <owner/repo> or set GITHUB_REPOSITORY}}"

head_refs=$(gh api "repos/$repo/commits/$sha/pulls" \
  --jq '.[] | select(.merged_at != null) | .head.ref')

while IFS= read -r ref; do
  if [[ "$ref" == bump-version-* ]]; then
    echo true
    exit 0
  fi
done <<< "$head_refs"

echo false
