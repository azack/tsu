import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { isGitRepo } from '../repo/is-git-repo.js';
import { resolveBaseRef } from '../repo/resolve-base-ref.js';
import { parseNameStatus } from './changed-file-entry.js';
import type { ChangedFileEntry } from './changed-file-entry.js';
import type { GetChangedFilesOptions } from './get-changed-files.js';

/**
 * Gets the changed files in the repository, each paired with its git change
 * status (added/modified/renamed/copied).
 *
 * Mirrors {@link getChangedFiles} but preserves the change type. Deletions are
 * excluded (`--diff-filter=ACMR`).
 *
 * @returns Array of changed file entries, or null if not in a git repo or on error
 */
export function getChangedFilesWithStatus(
  options: GetChangedFilesOptions = {}
): ChangedFileEntry[] | null {
  const { type = 'committed', baseBranch = 'main', cwd = process.cwd() } = options;

  try {
    if (!isGitRepo(cwd)) {
      return null;
    }

    const resolvedCwd = resolve(cwd);
    let command: string;

    switch (type) {
      case 'staged':
        command = 'git diff --name-status --diff-filter=ACMR --cached';
        break;

      case 'unstaged':
        command = 'git diff --name-status --diff-filter=ACMR';
        break;

      case 'committed': {
        const baseRef = resolveBaseRef(baseBranch, resolvedCwd);
        if (!baseRef) {
          return [];
        }

        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: resolvedCwd,
          stdio: 'pipe',
          encoding: 'utf-8',
        }).trim();

        if (currentBranch === baseBranch) {
          return [];
        }

        command = `git diff --name-status --diff-filter=ACMR ${escapeShellArg(baseRef)}...HEAD`;
        break;
      }
    }

    const result = execSync(command, {
      cwd: resolvedCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    return parseNameStatus(result);
  } catch {
    return null;
  }
}
