import {
  getChangedFiles,
  getFilesToPush,
  getCurrentBranch,
  type ChangeType,
} from '../commands/git/utils/git.js';
import { relative } from 'node:path';
import { findUnresolvedPackageRoots } from '../commands/dart/utils/dart.js';
import type { ChangedFilesOptions } from '../types/command-options.js';
import { isCommandInstalled } from './shell.js';
import { isVerbose } from './verbose-state.js';
import { logError } from './error-logger.js';

/**
 * Checks a condition and exits with an error if the condition is false.
 * Useful for validating prerequisites like being in a git repo or Dart package.
 * @param condition - The condition to check
 * @param errorMessage - The error message to display if condition is false
 * @param options - Optional configuration
 * @param options.verbose - If true, logs a success message when condition is true
 * @param options.successMessage - Message to log when condition is true and verbose is enabled
 * @param options.exitCode - Exit code to use when condition is false (defaults to 1)
 * @param options.command - The command being executed (for error logging)
 * @example
 * ensureCondition(isGitRepo(), 'Error: Not in a git repository', { command: 'tsu git changed' });
 * ensureCondition(isGitRepo(), 'Error: Not in a git repository', { verbose: true, successMessage: '✓ In git repository' });
 * ensureCondition(isDcmInstalled(), '⚠️  Warning: DCM not installed, skipping', { exitCode: 0 });
 */
export function ensureCondition(
  condition: boolean,
  errorMessage: string,
  options?: { verbose?: boolean; successMessage?: string; exitCode?: number; command?: string }
): void {
  if (!condition) {
    if (errorMessage) {
      // Log error if this is a failure (non-zero exit code)
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

/**
 * Ensures that Dart is installed. Exits with code 0 if not installed in non-verbose mode,
 * or shows a warning message in verbose mode.
 * @param verbose - Whether to show warning message when Dart is not installed
 * @example
 * ensureDartInstalled(verbose);
 */
export function ensureDartInstalled(verbose?: boolean): void {
  ensureCondition(
    isCommandInstalled('dart'),
    verbose ? '⚠️  Warning: dart not installed, skipping' : '',
    { exitCode: 0 }
  );
}

/**
 * Exits 1 when any of `files` (relative to `cwd`) belongs to a package whose dependencies
 * aren't resolved inside `repoRoot`. Analysis there would fail on every import, or resolve
 * them against a checkout above the repository.
 * @param checkName - The tool named in the message, e.g. 'dart analyze'
 * @example
 * ensurePackagesResolved(modifiedFiles, cwd, getGitRoot(cwd) ?? cwd, 'dart analyze');
 */
export function ensurePackagesResolved(
  files: string[],
  cwd: string,
  repoRoot: string,
  checkName: string
): void {
  const unresolved = findUnresolvedPackageRoots(files, cwd, repoRoot);
  if (unresolved.length === 0) {
    return;
  }

  console.error('');
  console.error(
    `❌ Push blocked: ${checkName} can't check these packages, because their dependencies aren't resolved in this checkout:`
  );
  unresolved.forEach((packageRoot) => {
    console.error(`  ${relative(repoRoot, packageRoot) || '.'}`);
  });
  console.error('');
  console.error('Run `flutter pub get` (or `dart pub get`), then push again.');
  process.exit(1);
}

/**
 * Ensures that DCM is installed. Exits with code 0 if not installed in non-verbose mode,
 * or shows a warning message in verbose mode.
 * @param verbose - Whether to show warning message when DCM is not installed
 * @example
 * ensureDCMInstalled(verbose);
 */
export function ensureDCMInstalled(verbose?: boolean): void {
  ensureCondition(
    isCommandInstalled('dcm'),
    verbose ? '⚠️  Warning: DCM not installed, skipping' : '',
    { exitCode: 0 }
  );
}

/**
 * Ensures that Claude CLI is installed. Exits with error code 1 if not installed,
 * showing an appropriate error message.
 * @example
 * ensureClaudeInstalled();
 */
export function ensureClaudeInstalled(): void {
  ensureCondition(
    isCommandInstalled('claude'),
    'Error: Claude CLI not found. Please install it from https://github.com/anthropics/claude-cli',
    { exitCode: 1 }
  );
}

/**
 * Options for displaying changed files
 */
export interface DisplayChangedFilesOptions extends ChangedFilesOptions {
  /** Optional filter function to filter files (e.g., only .dart files) */
  filter?: (file: string) => boolean;
  /** Optional prefix for the type in verbose output (e.g., "Dart") */
  typePrefix?: string;
}

/**
 * Gets changed files based on options, applying optional filters
 */
function getFilteredChangedFiles(
  type: ChangeType,
  baseBranch: string,
  filter?: (file: string) => boolean
): string[] | null {
  const files = getChangedFiles({ type, baseBranch });
  if (files === null) {
    return null;
  }
  return filter ? files.filter(filter) : files;
}

/**
 * Generic function to display changed files with consistent formatting.
 * Handles --all, --staged, --unstaged, --push flags and verbose output.
 * Outputs files to stdout and headers to stderr.
 */
export function displayChangedFiles(options: DisplayChangedFilesOptions): void {
  const baseBranch = options.baseBranch || 'main';
  const verbose = options.verbose || false;
  const filter = options.filter;
  const typePrefix = options.typePrefix ? `${options.typePrefix} ` : '';

  // Handle --push option
  if (options.push) {
    const pushFiles = getFilesToPush();

    if (pushFiles === null) {
      console.error('Error: Remote branch not found or not in a git repository');
      process.exit(1);
    }

    // Apply filter if provided
    const filteredFiles = filter ? pushFiles.filter(filter) : pushFiles;

    if (filteredFiles.length === 0) {
      // Exit silently for pipe-friendliness
      return;
    }

    if (verbose) {
      // Get current branch to show in verbose output
      const currentBranch = getCurrentBranch();
      console.error(
        `Files to push ${typePrefix}(origin/${currentBranch}..HEAD) (${filteredFiles.length}):`
      );
    }

    // Output files to stdout
    filteredFiles.forEach((file) => {
      console.log(file);
    });

    return;
  }

  // Handle --all option
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
      // Exit silently for pipe-friendliness
      return;
    }

    if (verbose) {
      // Verbose output with headers (to stderr to keep stdout clean)
      if (committedFiles.length > 0) {
        console.error(
          `Committed ${typePrefix}changes (compared to ${baseBranch}) (${committedFiles.length}):`
        );
      }
      if (stagedFiles.length > 0) {
        console.error(`Staged ${typePrefix}changes (${stagedFiles.length}):`);
      }
      if (unstagedFiles.length > 0) {
        console.error(`Unstaged ${typePrefix}changes (${unstagedFiles.length}):`);
      }
    }

    // Output files to stdout with type prefix for --all
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

  // Determine which type of changes to show
  let type: ChangeType = 'committed';
  if (options.staged) {
    type = 'staged';
  } else if (options.unstaged) {
    type = 'unstaged';
  }

  const files = getFilteredChangedFiles(type, baseBranch, filter);

  if (files === null) {
    console.error('Error: Failed to get changed files');
    process.exit(1);
  }

  if (files.length === 0) {
    // Exit silently for pipe-friendliness
    return;
  }

  if (verbose) {
    // Print header to stderr
    let header = '';
    if (type === 'committed') {
      header = `Changed ${typePrefix}files compared to ${baseBranch} (${files.length}):`;
    } else if (type === 'staged') {
      header = `Staged ${typePrefix}files (${files.length}):`;
    } else if (type === 'unstaged') {
      header = `Unstaged ${typePrefix}files (${files.length}):`;
    }
    console.error(header);
  }

  // Output files to stdout, one per line
  files.forEach((file) => {
    console.log(file);
  });
}

/**
 * Gets changed files based on options and optional filter, without displaying them.
 * Useful for commands that need to process changed files further.
 */
export function getChangedFilesWithOptions(options: DisplayChangedFilesOptions): string[] {
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

    // Combine all changed files and deduplicate
    const allFiles = [...committedFiles, ...stagedFiles, ...unstagedFiles];
    return Array.from(new Set(allFiles));
  }

  // Determine which type of changes to show
  let type: ChangeType = 'committed';
  if (options.staged) {
    type = 'staged';
  } else if (options.unstaged) {
    type = 'unstaged';
  }

  const files = getFilteredChangedFiles(type, baseBranch, filter);
  if (files === null) {
    console.error('Error: Failed to get changed files');
    process.exit(1);
  }

  return files;
}

/**
 * Options for displaying file list in verbose mode
 */
export interface DisplayFileListOptions {
  /** Files to display */
  files: string[];
  /** Verbose mode flag (optional, uses global verbose state if not provided) */
  verbose?: boolean;
  /** Message to display before the file list (e.g., "Running DCM analyze on") */
  message?: string;
}

/**
 * Displays a list of files in verbose mode with consistent formatting.
 * This centralizes the common pattern of displaying file lists across hook commands.
 * If verbose is not provided, uses the global verbose state.
 *
 * Format: "{message} {count} file(s):\n  {file1}\n  {file2}\n..."
 *
 * @param options - Options for displaying files
 * @example
 * displayFileList({
 *   files: modifiedFiles,
 *   verbose,
 *   message: 'Running DCM analyze on'
 * });
 * @example
 * // Uses global verbose state
 * displayFileList({
 *   files: modifiedFiles,
 *   message: 'Running DCM analyze on'
 * });
 */
export function displayFileList(options: DisplayFileListOptions): void {
  const { files, verbose, message } = options;
  const shouldDisplay = verbose !== undefined ? verbose : isVerbose();

  if (!shouldDisplay || files.length === 0) {
    return;
  }

  if (message) {
    console.error(`${message} ${files.length} file(s):`);
  } else {
    console.error(`Processing ${files.length} file(s):`);
  }

  files.forEach((file) => {
    console.error(`  ${file}`);
  });
}
