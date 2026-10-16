import { execSync } from 'node:child_process';
import { isGitRepo, hasUnstagedChanges, getAllChangedFiles } from '../../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../../files/utils/files.js';
import { escapeShellArg } from '../../../../utils/shell.js';
import {
  ensureCondition,
  ensureDCMInstalled,
  displayFileList,
} from '../../../../utils/command-helpers.js';
import { logIfVerbose } from '../../../../utils/logger.js';
import { handleDcmVersionWarning, isOnlyDcmVersionWarning } from '../../../../utils/dcm-parse.js';
import type { ChangedFilesOptions } from '../../../../types/command-options.js';
import { setVerbose } from '../../../../utils/verbose-state.js';
import { withoutGitRepositoryEnv } from '../../../../utils/without-git-repository-env.js';

export interface DartHookDcmCheckOptions extends ChangedFilesOptions {
  /** Suffixes to exclude from DCM checks. Defaults to COMMON_DART_CODEGEN_SUFFIXES */
  excludeSuffixes?: string[];
}

/**
 * Runs DCM fix on Dart files and checks if fixes created changes.
 * Gets changed files based on options (staged, unstaged, all, or committed changes).
 *
 * Steps:
 * 1. Checks if DCM is installed
 * 2. Gets modified Dart files (excluding generated files)
 * 3. Runs dcm fix on them
 * 4. Checks if fixes created any changes
 * 5. Exits with error if files were modified by DCM
 */
export function dartHookDcmCheck(options: DartHookDcmCheckOptions = {}): void {
  const verbose = options.verbose || false;
  const excludeSuffixes = options.excludeSuffixes || [...COMMON_DART_CODEGEN_SUFFIXES];

  // Set global verbose state for downstream functions
  setVerbose(verbose);

  // Check if DCM is installed
  ensureDCMInstalled(verbose);

  logIfVerbose(verbose, '🔧 Running DCM fix on modified files...');

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
    message: 'Running DCM fix on',
  });

  // Run dcm fix on the files
  /* v8 ignore next -- @preserve */
  try {
    const fileArgs = modifiedFiles.map(escapeShellArg).join(' ');
    const output = execSync(`dcm fix ${fileArgs}`, {
      cwd,
      env: withoutGitRepositoryEnv(),
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    // Check for version warnings in successful runs
    handleDcmVersionWarning(output);
  } catch (error) {
    // Check if this is just a version warning
    const err = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    };
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';

    // Handle version warnings in error output
    handleDcmVersionWarning(stderr);
    handleDcmVersionWarning(stdout);

    // If stderr contains ONLY a version warning (and stdout is empty), continue execution
    const isOnlyVersionWarning =
      stderr.length > 0 && isOnlyDcmVersionWarning(stderr) && stdout.length === 0;

    if (!isOnlyVersionWarning) {
      // Real error - fail the check
      console.error('Error: Failed to run dcm fix');
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exit(1);
    }
    // Version warning only - continue to next step
  }

  // Check if DCM fixes created changes in the files we fixed
  /* v8 ignore next -- @preserve */
  const filesWithChanges = modifiedFiles.filter((file) => hasUnstagedChanges(file, cwd));

  /* v8 ignore next -- @preserve */
  if (filesWithChanges.length > 0) {
    console.error('');
    console.error(
      '❌ Push blocked: DCM fixes were applied. Please stage and commit these changes:'
    );
    filesWithChanges.forEach((file) => {
      console.error(file);
    });
    process.exit(1);
  }

  logIfVerbose(verbose, '✓ All files pass DCM checks');
  process.exit(0);
}
