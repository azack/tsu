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
 * pulls in every file from commits that already landed upstream. This picks whichever
 * of `<baseBranch>` and `origin/<baseBranch>` forks from HEAD most recently, so the
 * diff contains only changes unique to the current branch.
 *
 * @param baseBranch - The base branch name. Defaults to 'main'
 * @param cwd - The directory to run git commands in. Defaults to process.cwd()
 * @returns `baseBranch` when it is at least as fresh as its remote counterpart (or no
 *   remote counterpart exists), `origin/<baseBranch>` when it is fresher, has diverged
 *   from the local branch, or the local branch doesn't exist, or null when neither
 *   ref exists
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
