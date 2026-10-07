import { isGitRepo, getAllChangedFiles } from '../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../files/utils/files.js';
import {
  ensureCondition,
  ensureDartInstalled,
  displayFileList,
} from '../../../utils/command-helpers.js';
import { logIfVerbose } from '../../../utils/logger.js';
import { dartAnalyze, DartAnalyzeTimeoutError } from '../../../utils/dart-analyze-parse.js';
import type { ChangedFilesOptions } from '../../../types/command-options.js';
import { setVerbose } from '../../../utils/verbose-state.js';

export interface DartHookAnalysisCheckOptions extends ChangedFilesOptions {
  /** Suffixes to exclude from analysis. Defaults to COMMON_DART_CODEGEN_SUFFIXES */
  excludeSuffixes?: string[];
  /** Milliseconds to wait for each package's dart analyze. Defaults to DEFAULT_HOOK_ANALYSIS_TIMEOUT_MS */
  timeout?: number;
}

export const DEFAULT_HOOK_ANALYSIS_TIMEOUT_MS = 20000;

/**
 * Runs dart analyze on Dart files and checks for issues.
 * Gets changed files based on options (staged, unstaged, all, or committed changes).
 *
 * Steps:
 * 1. Gets modified Dart files (excluding generated files)
 * 2. Maps files to their package roots
 * 3. Runs dart analyze on each unique package
 * 4. Exits with error if dart analyze reports any issues or fails to run.
 *    A timeout prints a warning and exits 0 instead, since it says nothing about the code.
 */
export function dartHookAnalysisCheck(options: DartHookAnalysisCheckOptions = {}): void {
  const verbose = options.verbose || false;
  const excludeSuffixes = options.excludeSuffixes || [...COMMON_DART_CODEGEN_SUFFIXES];

  // Set global verbose state for downstream functions
  setVerbose(verbose);

  // Check if Dart is installed
  ensureDartInstalled(verbose);

  logIfVerbose(verbose, '🔍 Running dart analyze on modified files...');

  // Check we're in both a git repo and a Dart package
  ensureCondition(isGitRepo(), 'Error: Not in a git repository');
  ensureCondition(isDartPackage(), 'Error: Not in a Dart package');

  const cwd = process.cwd();

  // Get files to check based on options
  const allFiles = getAllChangedFiles(options, cwd);

  // Filter to only Dart files
  const dartFiles = allFiles.filter((file) => file.endsWith('.dart'));

  // Filter out generated files
  const modifiedFiles = filterFilesBySuffix(dartFiles, excludeSuffixes);

  if (modifiedFiles.length === 0) {
    logIfVerbose(verbose, '✓ No Dart source files modified');
    process.exit(0);
  }

  // Display files being checked in verbose mode
  displayFileList({
    files: modifiedFiles,
    verbose,
    message: 'Running dart analyze on',
  });

  const timeout = options.timeout ?? DEFAULT_HOOK_ANALYSIS_TIMEOUT_MS;

  let result: ReturnType<typeof dartAnalyze>;
  try {
    result = dartAnalyze({ cwd, timeout, files: modifiedFiles });
  } catch (error: unknown) {
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
