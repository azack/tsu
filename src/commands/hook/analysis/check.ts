import { isGitRepo, getAllChangedFiles, getGitRoot } from '../../git/utils/git.js';
import { isDartPackage, COMMON_DART_CODEGEN_SUFFIXES } from '../../dart/utils/dart.js';
import { filterFilesBySuffix } from '../../files/utils/files.js';
import {
  ensureCondition,
  ensureDartInstalled,
  ensurePackagesResolved,
  displayFileList,
} from '../../../utils/command-helpers.js';
import { logIfVerbose } from '../../../utils/logger.js';
import { dartAnalyze } from '../../../utils/dart-analyze-parse.js';
import type { ChangedFilesOptions } from '../../../types/command-options.js';
import { setVerbose } from '../../../utils/verbose-state.js';

export interface DartHookAnalysisCheckOptions extends ChangedFilesOptions {
  /** Suffixes to exclude from analysis. Defaults to COMMON_DART_CODEGEN_SUFFIXES */
  excludeSuffixes?: string[];
}

/**
 * Runs dart analyze on Dart files and checks for issues.
 * Gets changed files based on options (staged, unstaged, all, or committed changes).
 *
 * Steps:
 * 1. Gets modified Dart files (excluding generated files)
 * 2. Maps files to their package roots
 * 3. Runs dart analyze on each unique package
 * 4. Exits with error if dart analyze reports any issues
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
  // Changed-file paths are relative to the repo root, wherever the check runs from
  const repoRoot = getGitRoot(cwd) ?? cwd;
  ensurePackagesResolved(modifiedFiles, repoRoot, repoRoot, 'dart analyze');

  // Run dart analyze on the files
  const result = dartAnalyze({ cwd, timeout: 20000, files: modifiedFiles });

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
