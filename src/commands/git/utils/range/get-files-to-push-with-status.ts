import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { getCurrentBranch } from '../repo/get-current-branch.js';
import { resolveBaseRef } from '../repo/resolve-base-ref.js';
import { getFilesInRange } from './get-files-in-range.js';
import { getFilesInRangeWithStatus } from './get-files-in-range-with-status.js';
import type { ChangedFileEntry } from '../changed-files/changed-file-entry.js';

export interface GetFilesToPushWithStatusOptions {
  /** The directory to check. Defaults to process.cwd() */
  cwd?: string;
  /** Base branch to compare against when remote doesn't exist. Defaults to 'main' */
  baseBranch?: string;
}

/**
 * Gets the files that would be pushed to the remote, each paired with its git
 * change status (added/modified/renamed/copied).
 *
 * Mirrors {@link getFilesToPush} but preserves the change type so callers can
 * decide whether a push can affect path-based ownership.
 *
 * @returns Array of changed file entries, or null if not in a git repo
 */
export function getFilesToPushWithStatus(
  options: GetFilesToPushWithStatusOptions = {}
): ChangedFileEntry[] | null {
  const { cwd = process.cwd(), baseBranch = 'main' } = options;
  try {
    const resolvedCwd = resolve(cwd);

    // getCurrentBranch is the single repo gate for this path: it returns null
    // when this isn't a git repo, so a separate isGitRepo check would just be a
    // redundant subprocess.
    const currentBranch = getCurrentBranch(resolvedCwd);
    if (!currentBranch) {
      return null;
    }

    if (currentBranch === baseBranch) {
      return [];
    }

    const baseRef = resolveBaseRef(baseBranch, resolvedCwd);
    if (!baseRef) {
      /* v8 ignore next -- @preserve */
      return [];
    }

    // Files unique to the feature branch (excludes files merged from base).
    const featureUniqueFiles = getFilesInRangeWithStatus({
      range: `${baseRef}...HEAD`,
      cwd: resolvedCwd,
    });

    if (!featureUniqueFiles) {
      /* v8 ignore next -- @preserve */
      return [];
    }

    // Check for a remote tracking branch inline, reusing the branch we already
    // resolved (getRemoteBranch would re-derive it via another getCurrentBranch).
    const remoteBranch = `origin/${currentBranch}`;
    try {
      execSync(`git rev-parse --verify ${escapeShellArg(remoteBranch)}`, {
        cwd: resolvedCwd,
        stdio: 'pipe',
      });
    } catch {
      // No remote (first push) - everything unique to HEAD is being pushed.
      return featureUniqueFiles;
    }

    // Remote exists - keep only files that are also in unpushed commits.
    const unpushedFiles = getFilesInRange({
      range: `${remoteBranch}..HEAD`,
      cwd: resolvedCwd,
    });

    if (!unpushedFiles) {
      /* v8 ignore next -- @preserve */
      return [];
    }

    const unpushedSet = new Set(unpushedFiles);
    return featureUniqueFiles.filter((entry) => unpushedSet.has(entry.path));
  } catch {
    /* v8 ignore next -- @preserve */
    return null;
  }
}
