import { isGitRepo, getAllChangedFiles, getGitRoot } from '../../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../../files/utils/files.js';
import { ensureCondition, ensureDCMInstalled, displayFileList, } from '../../../../utils/command-helpers.js';
import { logIfVerbose } from '../../../../utils/logger.js';
import { dcmAnalyze, DcmTimeoutError } from '../../../../utils/dcm-parse.js';
import { setVerbose } from '../../../../utils/verbose-state.js';
export const DEFAULT_HOOK_DCM_TIMEOUT_MS = 20000;
export function dartHookDcmAnalyzeCheck(options = {}) {
    const verbose = options.verbose || false;
    const excludeSuffixes = options.excludeSuffixes || [...COMMON_DART_CODEGEN_SUFFIXES];
    setVerbose(verbose);
    ensureDCMInstalled(verbose);
    logIfVerbose(verbose, '🔍 Running DCM analyze on modified files...');
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
        message: 'Running DCM analyze on',
    });
    const timeout = options.timeout ?? DEFAULT_HOOK_DCM_TIMEOUT_MS;
    let result;
    try {
        const runCwd = getGitRoot(cwd) ?? cwd;
        result = dcmAnalyze({ cwd: runCwd, timeout, files: modifiedFiles });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof DcmTimeoutError) {
            console.error(`⚠️  ${message}; skipping DCM analyze check.`);
            console.error('Raise the limit with --timeout <ms>.');
            process.exit(0);
        }
        console.error(`❌ Push blocked: ${message}`);
        process.exit(1);
    }
    if (!result.success) {
        const filesWithIssues = result.filesWithIssues;
        console.error('');
        console.error('❌ Push blocked: DCM analyze found issues in the following file(s):');
        filesWithIssues.forEach((file) => {
            console.error(`  ${file}`);
        });
        console.error('');
        console.error('Run `dcm fix` to fix the issues.');
        process.exit(1);
    }
    logIfVerbose(verbose, '✓ All files pass DCM analyze checks');
    process.exit(0);
}
