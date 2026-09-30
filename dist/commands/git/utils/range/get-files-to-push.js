import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { getCurrentBranch } from '../repo/get-current-branch.js';
import { resolveBaseRef } from '../repo/resolve-base-ref.js';
import { getFilesInRange } from './get-files-in-range.js';
export function getFilesToPush(options = {}) {
    const { cwd = process.cwd(), baseBranch = 'main' } = typeof options === 'string' ? { cwd: options } : options;
    try {
        const resolvedCwd = resolve(cwd);
        const currentBranch = getCurrentBranch(resolvedCwd);
        if (!currentBranch) {
            return null;
        }
        if (currentBranch === baseBranch) {
            return [];
        }
        const baseRef = resolveBaseRef(baseBranch, resolvedCwd);
        if (!baseRef) {
            return [];
        }
        const remoteBranch = `origin/${currentBranch}`;
        let hasRemote = true;
        try {
            execSync(`git rev-parse --verify ${escapeShellArg(remoteBranch)}`, {
                cwd: resolvedCwd,
                stdio: 'pipe',
            });
        }
        catch {
            hasRemote = false;
        }
        if (hasRemote) {
            const featureUniqueFiles = getFilesInRange({
                range: `${baseRef}...HEAD`,
                cwd: resolvedCwd,
            });
            const unpushedFiles = getFilesInRange({
                range: `${remoteBranch}..HEAD`,
                cwd: resolvedCwd,
            });
            if (!featureUniqueFiles || !unpushedFiles) {
                return [];
            }
            const featureUniqueSet = new Set(featureUniqueFiles);
            return unpushedFiles.filter((file) => featureUniqueSet.has(file));
        }
        const range = `${baseRef}...HEAD`;
        return getFilesInRange({ range, cwd: resolvedCwd });
    }
    catch {
        return null;
    }
}
