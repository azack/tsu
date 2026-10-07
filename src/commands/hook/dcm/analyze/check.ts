import { isGitRepo, getAllChangedFiles, getGitRoot } from '../../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../../files/utils/files.js';
import {
  ensureCondition,
  ensureDCMInstalled,
  ensurePackagesResolved,
  displayFileList,
} from '../../../../utils/command-helpers.js';
import { logIfVerbose } from '../../../../utils/logger.js';
import { dcmAnalyze, DcmTimeoutError } from '../../../../utils/dcm-parse.js';
import type { ChangedFilesOptions } from '../../../../types/command-options.js';
import { setVerbose } from '../../../../utils/verbose-state.js';

export interface DartHookDcmAnalyzeCheckOptions extends ChangedFilesOptions {
  /** Suffixes to exclude from DCM checks. Defaults to COMMON_DART_CODEGEN_SUFFIXES */
  excludeSuffixes?: string[];
  /** Milliseconds to wait for DCM before giving up. Defaults to DEFAULT_HOOK_DCM_TIMEOUT_MS */
  timeout?: number;
}

export const DEFAULT_HOOK_DCM_TIMEOUT_MS = 20000;

/**
 * Runs DCM analyze on Dart files and checks for issues.
 * Gets changed files based on options (staged, unstaged, all, or committed changes).
 *
 * Steps:
 * 1. Checks if DCM is installed
 * 2. Gets modified Dart files (excluding generated files)
 * 3. Runs dcm analyze on them
 * 4. Exits with error if DCM analyze reports any issues or fails to run
 *
 * A timeout warns without blocking, since it says nothing about the code.
 */
export function dartHookDcmAnalyzeCheck(options: DartHookDcmAnalyzeCheckOptions = {}): void {
  const verbose = options.verbose || false;
  const excludeSuffixes = options.excludeSuffixes || [...COMMON_DART_CODEGEN_SUFFIXES];

  // Set global verbose state for downstream functions
  setVerbose(verbose);

  // Check if DCM is installed
  ensureDCMInstalled(verbose);

  logIfVerbose(verbose, '🔍 Running DCM analyze on modified files...');

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
    message: 'Running DCM analyze on',
  });

  const timeout = options.timeout ?? DEFAULT_HOOK_DCM_TIMEOUT_MS;
  // Changed-file paths are relative to the repo root, so DCM must run from there
  const runCwd = getGitRoot(cwd) ?? cwd;

  ensurePackagesResolved(modifiedFiles, runCwd, runCwd, 'DCM analyze');

  let result: ReturnType<typeof dcmAnalyze>;
  try {
    result = dcmAnalyze({ cwd: runCwd, timeout, files: modifiedFiles });
  } catch (error: unknown) {
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
