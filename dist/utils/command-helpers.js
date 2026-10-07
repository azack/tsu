import { getChangedFiles, getFilesToPush, getCurrentBranch, } from '../commands/git/utils/git.js';
import { relative } from 'node:path';
import { findUnresolvedPackageRoots } from '../commands/dart/utils/dart.js';
import { isCommandInstalled } from './shell.js';
import { isVerbose } from './verbose-state.js';
import { logError } from './error-logger.js';
export function ensureCondition(condition, errorMessage, options) {
    if (!condition) {
        if (errorMessage) {
            if ((options?.exitCode ?? 1) !== 0 && options?.command) {
                logError(new Error(errorMessage), options.command);
            }
            console.error(errorMessage);
        }
        process.exit(options?.exitCode ?? 1);
    }
    if (options?.verbose && options?.successMessage) {
        console.error(options.successMessage);
    }
}
export function ensureDartInstalled(verbose) {
    ensureCondition(isCommandInstalled('dart'), verbose ? '⚠️  Warning: dart not installed, skipping' : '', { exitCode: 0 });
}
export function ensurePackagesResolved(files, cwd, repoRoot, checkName) {
    const unresolved = findUnresolvedPackageRoots(files, cwd, repoRoot);
    if (unresolved.length === 0) {
        return;
    }
    console.error('');
    console.error(`❌ Push blocked: ${checkName} can't check these packages, because their dependencies aren't resolved in this checkout:`);
    unresolved.forEach((packageRoot) => {
        console.error(`  ${relative(repoRoot, packageRoot) || '.'}`);
    });
    console.error('');
    console.error('Run `flutter pub get` (or `dart pub get`), then push again.');
    process.exit(1);
}
export function ensureDCMInstalled(verbose) {
    ensureCondition(isCommandInstalled('dcm'), verbose ? '⚠️  Warning: DCM not installed, skipping' : '', { exitCode: 0 });
}
export function ensureClaudeInstalled() {
    ensureCondition(isCommandInstalled('claude'), 'Error: Claude CLI not found. Please install it from https://github.com/anthropics/claude-cli', { exitCode: 1 });
}
function getFilteredChangedFiles(type, baseBranch, filter) {
    const files = getChangedFiles({ type, baseBranch });
    if (files === null) {
        return null;
    }
    return filter ? files.filter(filter) : files;
}
export function displayChangedFiles(options) {
    const baseBranch = options.baseBranch || 'main';
    const verbose = options.verbose || false;
    const filter = options.filter;
    const typePrefix = options.typePrefix ? `${options.typePrefix} ` : '';
    if (options.push) {
        const pushFiles = getFilesToPush();
        if (pushFiles === null) {
            console.error('Error: Remote branch not found or not in a git repository');
            process.exit(1);
        }
        const filteredFiles = filter ? pushFiles.filter(filter) : pushFiles;
        if (filteredFiles.length === 0) {
            return;
        }
        if (verbose) {
            const currentBranch = getCurrentBranch();
            console.error(`Files to push ${typePrefix}(origin/${currentBranch}..HEAD) (${filteredFiles.length}):`);
        }
        filteredFiles.forEach((file) => {
            console.log(file);
        });
        return;
    }
    if (options.all) {
        const committedFiles = getFilteredChangedFiles('committed', baseBranch, filter);
        const stagedFiles = getFilteredChangedFiles('staged', baseBranch, filter);
        const unstagedFiles = getFilteredChangedFiles('unstaged', baseBranch, filter);
        if (committedFiles === null || stagedFiles === null || unstagedFiles === null) {
            console.error('Error: Failed to get changed files');
            process.exit(1);
        }
        const totalChanges = committedFiles.length + stagedFiles.length + unstagedFiles.length;
        if (totalChanges === 0) {
            return;
        }
        if (verbose) {
            if (committedFiles.length > 0) {
                console.error(`Committed ${typePrefix}changes (compared to ${baseBranch}) (${committedFiles.length}):`);
            }
            if (stagedFiles.length > 0) {
                console.error(`Staged ${typePrefix}changes (${stagedFiles.length}):`);
            }
            if (unstagedFiles.length > 0) {
                console.error(`Unstaged ${typePrefix}changes (${unstagedFiles.length}):`);
            }
        }
        committedFiles.forEach((file) => {
            console.log(`committed:${file}`);
        });
        stagedFiles.forEach((file) => {
            console.log(`staged:${file}`);
        });
        unstagedFiles.forEach((file) => {
            console.log(`unstaged:${file}`);
        });
        return;
    }
    let type = 'committed';
    if (options.staged) {
        type = 'staged';
    }
    else if (options.unstaged) {
        type = 'unstaged';
    }
    const files = getFilteredChangedFiles(type, baseBranch, filter);
    if (files === null) {
        console.error('Error: Failed to get changed files');
        process.exit(1);
    }
    if (files.length === 0) {
        return;
    }
    if (verbose) {
        let header = '';
        if (type === 'committed') {
            header = `Changed ${typePrefix}files compared to ${baseBranch} (${files.length}):`;
        }
        else if (type === 'staged') {
            header = `Staged ${typePrefix}files (${files.length}):`;
        }
        else if (type === 'unstaged') {
            header = `Unstaged ${typePrefix}files (${files.length}):`;
        }
        console.error(header);
    }
    files.forEach((file) => {
        console.log(file);
    });
}
export function getChangedFilesWithOptions(options) {
    const baseBranch = options.baseBranch || 'main';
    const filter = options.filter;
    if (options.all) {
        const committedFiles = getFilteredChangedFiles('committed', baseBranch, filter);
        const stagedFiles = getFilteredChangedFiles('staged', baseBranch, filter);
        const unstagedFiles = getFilteredChangedFiles('unstaged', baseBranch, filter);
        if (committedFiles === null || stagedFiles === null || unstagedFiles === null) {
            console.error('Error: Failed to get changed files');
            process.exit(1);
        }
        const allFiles = [...committedFiles, ...stagedFiles, ...unstagedFiles];
        return Array.from(new Set(allFiles));
    }
    let type = 'committed';
    if (options.staged) {
        type = 'staged';
    }
    else if (options.unstaged) {
        type = 'unstaged';
    }
    const files = getFilteredChangedFiles(type, baseBranch, filter);
    if (files === null) {
        console.error('Error: Failed to get changed files');
        process.exit(1);
    }
    return files;
}
export function displayFileList(options) {
    const { files, verbose, message } = options;
    const shouldDisplay = verbose !== undefined ? verbose : isVerbose();
    if (!shouldDisplay || files.length === 0) {
        return;
    }
    if (message) {
        console.error(`${message} ${files.length} file(s):`);
    }
    else {
        console.error(`Processing ${files.length} file(s):`);
    }
    files.forEach((file) => {
        console.error(`  ${file}`);
    });
}
