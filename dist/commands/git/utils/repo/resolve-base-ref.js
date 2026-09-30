import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { escapeShellArg } from '../../../../utils/shell.js';
import { logIfVerbose } from '../../../../utils/logger.js';
function refExists(ref, cwd) {
    try {
        execSync(`git rev-parse --verify ${escapeShellArg(ref)}`, { cwd, stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
function mergeBaseWithHead(ref, cwd) {
    try {
        return execSync(`git merge-base ${escapeShellArg(ref)} HEAD`, {
            cwd,
            stdio: 'pipe',
            encoding: 'utf-8',
        }).trim();
    }
    catch {
        return null;
    }
}
function isAncestor(ancestor, descendant, cwd) {
    try {
        execSync(`git merge-base --is-ancestor ${escapeShellArg(ancestor)} ${escapeShellArg(descendant)}`, { cwd, stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
export function resolveBaseRef(baseBranch = 'main', cwd = process.cwd()) {
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
    if (!localForkPoint || isAncestor(localForkPoint, remoteForkPoint, resolvedCwd)) {
        logIfVerbose(undefined, `Local ${baseBranch} is behind ${remoteRef}; comparing against ${remoteRef}`);
        return remoteRef;
    }
    return baseBranch;
}
