import { execSync } from 'node:child_process';
import { isGitRepo, hasUnstagedChanges, getAllChangedFiles } from '../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../files/utils/files.js';
import { escapeShellArg } from '../../../utils/shell.js';
import {
  ensureCondition,
  ensureDartInstalled,
  displayFileList,
} from '../../../utils/command-helpers.js';
import { logIfVerbose } from '../../../utils/logger.js';
import type { ChangedFilesOptions } from '../../../types/command-options.js';
import { setVerbose } from '../../../utils/verbose-state.js';
import { withoutGitRepositoryEnv } from '../../../utils/without-git-repository-env.js';

export interface DartHookFixCheckOptions extends ChangedFilesOptions {
  /** Suffixes to exclude from fix. Defaults to COMMON_DART_CODEGEN_SUFFIXES */
  excludeSuffixes?: string[];
}

/**
 * Runs dart fix on Dart files and checks if fixes created changes.
 * Gets changed files based on options (staged, unstaged, all, or committed changes).
 *
 * Steps:
 * 1. Gets modified Dart files (excluding generated files)
 * 2. Runs dart fix --apply on each file individually
 * 3. Checks if fixes created any changes
 * 4. Exits with error if files were modified
 */
export function dartHookFixCheck(options: DartHookFixCheckOptions = {}): void {
  const verbose = options.verbose || false;
  const excludeSuffixes = options.excludeSuffixes || [...COMMON_DART_CODEGEN_SUFFIXES];

  // Set global verbose state for downstream functions
  setVerbose(verbose);

  // Check if Dart is installed
  ensureDartInstalled(verbose);

  logIfVerbose(verbose, '🔧 Running dart fix on modified files...');

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
    message: 'Running dart fix on',
  });

  // Run dart fix --apply on each file individually
  // Note: dart fix can only be run on one file at a time
  /* v8 ignore next -- @preserve */
  try {
    for (const file of modifiedFiles) {
      const fileArg = escapeShellArg(file);
      execSync(`dart fix --apply ${fileArg}`, {
        cwd,
        env: withoutGitRepositoryEnv(),
        stdio: 'pipe',
      });
    }
  } catch (error) {
    console.error('Error: Failed to run dart fix');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }

  // Check if fixes created changes in the files we analyzed
  /* v8 ignore next -- @preserve */
  const filesWithChanges = modifiedFiles.filter((file) => hasUnstagedChanges(file, cwd));

  /* v8 ignore next -- @preserve */
  if (filesWithChanges.length > 0) {
    console.error('');
    console.error(
      '❌ Push blocked: Dart fixes were applied. Please stage and commit these changes:'
    );
    filesWithChanges.forEach((file) => {
      console.error(file);
    });
    process.exit(1);
  }

  logIfVerbose(verbose, '✓ All files pass dart fix');
  process.exit(0);
}
