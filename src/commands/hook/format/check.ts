import { execSync } from 'node:child_process';
import { isGitRepo, hasUnstagedChanges, getAllChangedFiles } from '../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../files/utils/files.js';
import { escapeShellArg } from '../../../utils/shell.js';
import { logIfVerbose } from '../../../utils/logger.js';
import {
  ensureCondition,
  ensureDartInstalled,
  displayFileList,
} from '../../../utils/command-helpers.js';
import type { ChangedFilesOptions } from '../../../types/command-options.js';
import { setVerbose } from '../../../utils/verbose-state.js';
import { withoutGitRepositoryEnv } from '../../../utils/without-git-repository-env.js';

export interface DartHookFormatCheckOptions extends ChangedFilesOptions {
  /** Suffixes to exclude from formatting. Defaults to COMMON_DART_CODEGEN_SUFFIXES */
  excludeSuffixes?: string[];
}

/**
 * Formats Dart files and checks if formatting created changes.
 * Gets changed files based on options (staged, unstaged, all, or committed changes).
 *
 * Steps:
 * 1. Gets modified Dart files (excluding generated files)
 * 2. Formats them with dart format
 * 3. Checks if formatting created any changes
 * 4. Exits with error if files were formatted
 */
export function dartHookFormatCheck(options: DartHookFormatCheckOptions = {}): void {
  const verbose = options.verbose || false;
  const excludeSuffixes = options.excludeSuffixes || [...COMMON_DART_CODEGEN_SUFFIXES];

  // Set global verbose state for downstream functions
  setVerbose(verbose);

  // Check if Dart is installed
  ensureDartInstalled(verbose);

  logIfVerbose(verbose, '🎨 Running dart format on modified files...');

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
    message: 'Running dart format on',
  });

  // Format the files
  /* v8 ignore next -- @preserve */
  try {
    const fileArgs = modifiedFiles.map(escapeShellArg).join(' ');
    execSync(`dart format ${fileArgs}`, {
      cwd,
      env: withoutGitRepositoryEnv(),
      stdio: 'pipe',
    });
  } catch (error) {
    console.error('Error: Failed to run dart format');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }

  // Check if formatting created changes in the files we formatted
  /* v8 ignore next -- @preserve */
  const filesWithChanges = modifiedFiles.filter((file) => hasUnstagedChanges(file, cwd));

  /* v8 ignore next -- @preserve */
  if (filesWithChanges.length > 0) {
    console.error('');
    console.error('❌ Push blocked: Files were formatted. Please stage and commit these changes:');
    filesWithChanges.forEach((file) => {
      console.error(file);
    });
    process.exit(1);
  }

  logIfVerbose(verbose, '✓ All files properly formatted');
  process.exit(0);
}
