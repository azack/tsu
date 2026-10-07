import { isGitRepo, getAllChangedFiles } from '../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../files/utils/files.js';
import { ensureCondition, ensureDartInstalled, displayFileList, } from '../../../utils/command-helpers.js';
import { logIfVerbose } from '../../../utils/logger.js';
import { dartAnalyze, DartAnalyzeTimeoutError } from '../../../utils/dart-analyze-parse.js';
import { setVerbose } from '../../../utils/verbose-state.js';
export const DEFAULT_HOOK_ANALYSIS_TIMEOUT_MS = 20000;
export function dartHookAnalysisCheck(options = {}) {
    const verbose = options.verbose || false;
    const excludeSuffixes = options.excludeSuffixes || [...COMMON_DART_CODEGEN_SUFFIXES];
    setVerbose(verbose);
    ensureDartInstalled(verbose);
    logIfVerbose(verbose, '🔍 Running dart analyze on modified files...');
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
        message: 'Running dart analyze on',
    });
    const timeout = options.timeout ?? DEFAULT_HOOK_ANALYSIS_TIMEOUT_MS;
    let result;
    try {
        result = dartAnalyze({ cwd, timeout, files: modifiedFiles });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof DartAnalyzeTimeoutError) {
            console.error(`⚠️  ${message}; skipping dart analyze check.`);
            console.error('Raise the limit with --timeout <ms>.');
            process.exit(0);
        }
        console.error(`❌ Push blocked: ${message}`);
        process.exit(1);
    }
    if (!result.success) {
        const filesWithIssues = result.filesWithIssues;
        console.error('');
        console.error('❌ Push blocked: dart analyze found issues in the following file(s):');
        filesWithIssues.forEach((file) => {
            console.error(`  ${file}`);
        });
        console.error('');
        console.error('Run `dart fix --apply` to fix some issues automatically.');
        process.exit(1);
    }
    logIfVerbose(verbose, '✓ All files pass dart analyze');
    process.exit(0);
}
