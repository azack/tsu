import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { isGitRepo } from '../repo/is-git-repo.js';
import { resolveBaseRef } from '../repo/resolve-base-ref.js';

export type ChangeType = 'committed' | 'staged' | 'unstaged';

export interface GetChangedFilesOptions {
  /** The type of changes to get. Defaults to 'committed' */
  type?: ChangeType;
  /** The base branch to compare against for committed changes. Defaults to 'main' */
  baseBranch?: string;
  /** The directory to run git commands in. Defaults to process.cwd() */
  cwd?: string;
}

/**
 * Gets the list of changed files in the repository.
 * @param options - Configuration options
 * @returns Array of file paths, or null if not in a git repo or on error
 */
export function getChangedFiles(options: GetChangedFilesOptions = {}): string[] | null {
  const { type = 'committed', baseBranch = 'main', cwd = process.cwd() } = options;

  try {
    if (!isGitRepo(cwd)) {
      return null;
    }

    const resolvedCwd = resolve(cwd);
    let command: string;

    switch (type) {
      case 'staged':
        // Get staged changes
        command = 'git diff --name-only --cached';
        break;

      case 'unstaged':
        // Get unstaged changes
        command = 'git diff --name-only';
        break;

      case 'committed': {
        // Get committed changes compared to base branch
        // First resolve the base ref (local or origin/, whichever is fresher)
        const baseRef = resolveBaseRef(baseBranch, resolvedCwd);
        if (!baseRef) {
          // Base branch doesn't exist, return empty array
          return [];
        }

        // Check if we're on the base branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: resolvedCwd,
          stdio: 'pipe',
          encoding: 'utf-8',
        }).trim();

        if (currentBranch === baseBranch) {
          // On base branch, no committed changes to compare
          return [];
        }

        // Compare current branch to base branch
        command = `git diff --name-only ${escapeShellArg(baseRef)}...HEAD`;
        break;
      }
    }

    const result = execSync(command, {
      cwd: resolvedCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    // Split by newlines and filter out empty strings
    return result
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return null;
  }
}
