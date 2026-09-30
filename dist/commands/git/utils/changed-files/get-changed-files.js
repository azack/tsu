import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { isGitRepo } from '../repo/is-git-repo.js';
import { resolveBaseRef } from '../repo/resolve-base-ref.js';
export function getChangedFiles(options = {}) {
    const { type = 'committed', baseBranch = 'main', cwd = process.cwd() } = options;
    try {
        if (!isGitRepo(cwd)) {
            return null;
        }
        const resolvedCwd = resolve(cwd);
        let command;
        switch (type) {
            case 'staged':
                command = 'git diff --name-only --cached';
                break;
            case 'unstaged':
                command = 'git diff --name-only';
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
                command = `git diff --name-only ${escapeShellArg(baseRef)}...HEAD`;
                break;
            }
        }
        const result = execSync(command, {
            cwd: resolvedCwd,
            stdio: 'pipe',
            encoding: 'utf-8',
        });
        return result
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }
    catch {
        return null;
    }
}
