import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { logIfVerbose } from '../../../../utils/logger.js';

function refExists(ref: string, cwd: string): boolean {
  try {
    execSync(`git rev-parse --verify ${escapeShellArg(ref)}`, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function mergeBaseWithHead(ref: string, cwd: string): string | null {
  try {
    return execSync(`git merge-base ${escapeShellArg(ref)} HEAD`, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

function isAncestor(ancestor: string, descendant: string, cwd: string): boolean {
  try {
    execSync(
      `git merge-base --is-ancestor ${escapeShellArg(ancestor)} ${escapeShellArg(descendant)}`,
      { cwd, stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the ref that feature-branch diffs (`<ref>...HEAD`) should compare against.
 *
 * A local base branch is often behind `origin/<baseBranch>` (e.g. in worktree-heavy
 * setups where local `main` is rarely updated). Diffing against the stale local ref
 * pulls in every file from commits that already landed upstream.
 *
 * This compares the fork points `merge-base(<baseBranch>, HEAD)` and
 * `merge-base(origin/<baseBranch>, HEAD)`, which are what the three-dot diff starts
 * from. The local ref is kept when its fork point is the same as or newer than
 * origin's; otherwise (origin's is newer, the two are unrelated, or only origin's can
 * be computed) origin wins. The refs themselves are not compared, so a local-only
 * commit on the base branch is excluded from the diff whenever the local ref wins.
 *
 * @param baseBranch - The base branch name. Defaults to 'main'
 * @param cwd - The directory to run git commands in. Defaults to process.cwd()
 * @returns The ref to diff against: `baseBranch` or `origin/<baseBranch>` per the rule
 *   above, `origin/<baseBranch>` when the local branch doesn't exist, `baseBranch`
 *   when no remote counterpart exists or origin's fork point can't be computed, or null
 *   when neither ref exists
 *
 * @example
 * // Local main is 40 commits behind origin/main, feature branched from origin/main
 * resolveBaseRef('main'); // 'origin/main'
 */
export function resolveBaseRef(baseBranch = 'main', cwd: string = process.cwd()): string | null {
  const resolvedCwd = resolve(cwd);
  const remoteRef = `origin/${baseBranch}`;

  const hasLocal = refExists(baseBranch, resolvedCwd);
  const hasRemote = !baseBranch.startsWith('origin/') && refExists(remoteRef, resolvedCwd);

  if (!hasRemote) {
    return hasLocal ? baseBranch : null;
  }

  if (!hasLocal) {
    logIfVerbose(undefined, `Base branch ${baseBranch} not found locally; using ${remoteRef}`);
    return remoteRef;
  }

  const localForkPoint = mergeBaseWithHead(baseBranch, resolvedCwd);
  const remoteForkPoint = mergeBaseWithHead(remoteRef, resolvedCwd);

  if (!remoteForkPoint || localForkPoint === remoteForkPoint) {
    return baseBranch;
  }

  if (localForkPoint && isAncestor(remoteForkPoint, localForkPoint, resolvedCwd)) {
    return baseBranch;
  }

  logIfVerbose(
    undefined,
    `Local ${baseBranch} is behind or has diverged from ${remoteRef}; comparing against ${remoteRef}`
  );
  return remoteRef;
}
