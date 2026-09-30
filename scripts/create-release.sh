#!/usr/bin/env bash
# Publish a GitHub release for a version tag that already exists on the remote.
#
# Usage: scripts/create-release.sh <tag> [<owner/repo>]
#
# `tsu upgrade` finds the newest version through `releases/latest`, so a tag
# with no release is invisible to it. tag-version.yml calls this right after it
# pushes a tag; release.yml calls it to backfill a tag by hand.
#
# Idempotent: a tag that already has a release is left alone and exits 0.
# Requires GH_TOKEN with contents: write.
set -euo pipefail

tag="${1:?usage: create-release.sh <tag> [<owner/repo>]}"
repo="${2:-${GITHUB_REPOSITORY:?pass <owner/repo> or set GITHUB_REPOSITORY}}"

if ! [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: tag must look like vX.Y.Z, got '$tag'" >&2
  exit 1
fi

if gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
  echo "Release $tag already exists; nothing to do."
  exit 0
fi

# Set --latest explicitly: left unset, GitHub marks every new release latest,
# so backfilling an old tag would take over releases/latest.
highest=$(gh api "repos/$repo/tags" --paginate --jq '.[].name' |
  grep --extended-regexp '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort --version-sort | tail --lines=1)
if [[ "$tag" == "$highest" ]]; then
  latest_flag=--latest
else
  latest_flag=--latest=false
fi

gh release create "$tag" \
  --repo "$repo" \
  --verify-tag \
  --title "Release $tag" \
  --generate-notes \
  "$latest_flag"

echo "Created release $tag."
