import { execSync } from 'node:child_process';
import { isGitRepo, hasUnstagedChanges, getAllChangedFiles } from '../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../files/utils/files.js';
import { escapeShellArg } from '../../../utils/shell.js';
import { ensureCondition, ensureDartInstalled, displayFileList, } from '../../../utils/command-helpers.js';
import { logIfVerbose } from '../../../utils/logger.js';
import { setVerbose } from '../../../utils/verbose-state.js';
import { withoutGitRepositoryEnv } from '../../../utils/without-git-repository-env.js';
export function dartHookFixCheck(options = {}) {
    const verbose = options.verbose || false;
    const excludeSuffixes = options.excludeSuffixes || [...COMMON_DART_CODEGEN_SUFFIXES];
    setVerbose(verbose);
    ensureDartInstalled(verbose);
    logIfVerbose(verbose, '🔧 Running dart fix on modified files...');
    ensureCondition(isGitRepo(), 'Error: Not in a git repository');
    ensureCondition(isDartPackage(), 'Error: Not in a Dart package');
    const cwd = process.cwd();
    const allFiles = getAllChangedFiles(options, cwd);
    const dartFiles = allFiles.filter((file) => file.endsWith('.dart'));
    const modifiedFiles = filterFilesBySuffix(dartFiles, excludeSuffixes);
    if (modifiedFiles.length === 0) {
        logIfVerbose(verbose, '✓ No Dart source files modified');
        process.exit(0);
    }
    displayFileList({
        files: modifiedFiles,
        verbose,
        message: 'Running dart fix on',
    });
    try {
        for (const file of modifiedFiles) {
            const fileArg = escapeShellArg(file);
            execSync(`dart fix --apply ${fileArg}`, {
                cwd,
                env: withoutGitRepositoryEnv(),
                stdio: 'pipe',
            });
        }
    }
    catch (error) {
        console.error('Error: Failed to run dart fix');
        if (error instanceof Error) {
            console.error(error.message);
        }
        process.exit(1);
    }
    const filesWithChanges = modifiedFiles.filter((file) => hasUnstagedChanges(file, cwd));
    if (filesWithChanges.length > 0) {
        console.error('');
        console.error('❌ Push blocked: Dart fixes were applied. Please stage and commit these changes:');
        filesWithChanges.forEach((file) => {
            console.error(file);
        });
        process.exit(1);
    }
    logIfVerbose(verbose, '✓ All files pass dart fix');
    process.exit(0);
}
