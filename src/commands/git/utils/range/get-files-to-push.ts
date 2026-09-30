import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { getCurrentBranch } from '../repo/get-current-branch.js';
import { resolveBaseRef } from '../repo/resolve-base-ref.js';
import { getFilesInRange } from './get-files-in-range.js';

export interface GetFilesToPushOptions {
  /** The directory to check. Defaults to process.cwd() */
  cwd?: string;
  /** Base branch to compare against when remote doesn't exist. Defaults to 'main' */
  baseBranch?: string;
}

/**
 * Gets the list of files that would be pushed to the remote.
 *
 * When a remote tracking branch exists (origin/<branch>), returns only files that are:
 * 1. In unpushed commits (origin/<branch>..HEAD)
 * 2. Unique to the feature branch (excludes files from merge commits)
 *
 * When no remote exists (first push), falls back to comparing against the base branch
 * using three-dot diff to exclude merged files.
 *
 * This is designed for pre-push hooks where you want to check only the files
 * being pushed, not files already on the remote or merged from other branches.
 *
 * @param options - Configuration options or just the cwd string (for backwards compatibility)
 * @returns Array of file paths to be pushed, or null if not in a git repo
 *
 * @example
 * // On feature branch with 1 new local file, after merging main:
 * // - feature.txt (already pushed)
 * // - new-feature.txt (local, unpushed)
 * // - main1.txt, main2.txt (merged from main)
 * // Result: ['new-feature.txt'] - only unpushed feature files
 */
export function getFilesToPush(options: GetFilesToPushOptions | string = {}): string[] | null {
  // Support legacy string parameter for backwards compatibility
  const { cwd = process.cwd(), baseBranch = 'main' } =
    typeof options === 'string' ? { cwd: options } : options;
  try {
    const resolvedCwd = resolve(cwd);

    // getCurrentBranch is the single repo gate for this path: it returns null
    // when this isn't a git repo, so a separate isGitRepo check would just be a
    // redundant subprocess.
    const currentBranch = getCurrentBranch(resolvedCwd);

    if (!currentBranch) {
      return null;
    }

    // Check if we're on the base branch
    if (currentBranch === baseBranch) {
      // On base branch, return empty array (no files to check)
      return [];
    }

    // Resolve the base ref (local or origin/, whichever is fresher)
    const baseRef = resolveBaseRef(baseBranch, resolvedCwd);
    if (!baseRef) {
      // Base branch doesn't exist, return empty array
      /* v8 ignore next -- @preserve */
      return [];
    }

    // Check for a remote tracking branch inline, reusing the branch we already
    // resolved (getRemoteBranch would re-derive it via another getCurrentBranch).
    const remoteBranch = `origin/${currentBranch}`;
    let hasRemote = true;
    try {
      execSync(`git rev-parse --verify ${escapeShellArg(remoteBranch)}`, {
        cwd: resolvedCwd,
        stdio: 'pipe',
      });
    } catch {
      hasRemote = false;
    }

    if (hasRemote) {
      // Remote exists - get intersection of unpushed files and feature-unique files
      // This excludes both already-pushed files AND files from merge commits

      // Files unique to feature branch (excludes merged files from base branch)
      const featureUniqueFiles = getFilesInRange({
        range: `${baseRef}...HEAD`,
        cwd: resolvedCwd,
      });

      // Files in unpushed commits
      const unpushedFiles = getFilesInRange({
        range: `${remoteBranch}..HEAD`,
        cwd: resolvedCwd,
      });

      if (!featureUniqueFiles || !unpushedFiles) {
        /* v8 ignore next -- @preserve */
        return [];
      }

      // Return intersection: files that are both unpushed AND unique to feature branch
      const featureUniqueSet = new Set(featureUniqueFiles);
      return unpushedFiles.filter((file) => featureUniqueSet.has(file));
    }

    // No remote exists (first push) - use three-dot range against base branch
    // This shows only changes unique to HEAD, excluding merged files
    const range = `${baseRef}...HEAD`;
    return getFilesInRange({ range, cwd: resolvedCwd });
  } catch {
    /* v8 ignore next -- @preserve */
    return null;
  }
}
