import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { isGitRepo } from '../repo/is-git-repo.js';
import { resolveBaseRef } from '../repo/resolve-base-ref.js';

/**
 * Gets the diff between a base branch and HEAD.
 * @param baseBranch - The base branch to compare against. Defaults to 'main'
 * @param cwd - The directory to check. Defaults to process.cwd()
 * @returns The diff as a string, or null if not in a git repo or on error
 */
export function getBranchDiff(baseBranch = 'main', cwd: string = process.cwd()): string | null {
  try {
    if (!isGitRepo(cwd)) {
      return null;
    }

    const resolvedCwd = resolve(cwd);

    const baseRef = resolveBaseRef(baseBranch, resolvedCwd);
    if (!baseRef) {
      return null;
    }

    const result = execSync(`git diff ${escapeShellArg(baseRef)}...HEAD`, {
      cwd: resolvedCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    const diff = result.trim();
    return diff.length > 0 ? diff : null;
  } catch {
    /* v8 ignore next -- @preserve */
    return null;
  }
}
