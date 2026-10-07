import { execSync } from 'node:child_process';
import { isGitRepo, getGitStatus, getAllChangedFiles } from '../../git/utils/git.js';
import { isDartPackage } from '../../dart/utils/dart.js';
import { ensureCondition, displayFileList } from '../../../utils/command-helpers.js';
import { isCommandInstalled } from '../../../utils/shell.js';
import { logIfVerbose } from '../../../utils/logger.js';
import type { ChangedFilesOptions } from '../../../types/command-options.js';
import { setVerbose } from '../../../utils/verbose-state.js';
import { withoutGitRepositoryEnv } from '../../../utils/without-git-repository-env.js';

export type DartHookGraphqlCheckOptions = ChangedFilesOptions;

/**
 * Checks if GraphQL files are modified and runs code generation to verify fakes are up to date.
 * Gets changed files based on options (staged, unstaged, all, or committed changes).
 *
 * Steps:
 * 1. Checks if melos is installed
 * 2. Gets modified .graphql files, exits if none
 * 3. Saves git status before running codegen
 * 4. Runs GraphQL code generation (melos run codegen:graphql and melos run codegen:graphql:test)
 * 5. Checks if codegen created any changes
 * 6. Exits with error if files were modified by codegen
 */
export async function dartHookGraphqlCheck(
  options: DartHookGraphqlCheckOptions = {}
): Promise<void> {
  const verbose = options.verbose || false;
  const codegenCommands = ['melos run codegen:graphql', 'melos run codegen:graphql:test'];

  // Set global verbose state for downstream functions
  setVerbose(verbose);

  logIfVerbose(verbose, '🧪 Checking for modified GraphQL files...');

  // Check we're in both a git repo and a Dart package
  ensureCondition(isGitRepo(), 'Error: Not in a git repository');
  ensureCondition(isDartPackage(), 'Error: Not in a Dart package');

  const cwd = process.cwd();

  // Get files to check based on options
  const allFiles = getAllChangedFiles(options, cwd);

  // Filter to only GraphQL files
  const graphqlFiles = allFiles.filter((file) => file.endsWith('.graphql'));

  ensureCondition(
    graphqlFiles.length > 0,
    verbose ? '✓ No GraphQL files modified (skipping)' : '',
    { exitCode: 0 }
  );

  // Display files being checked in verbose mode
  displayFileList({
    files: graphqlFiles,
    verbose,
    message: 'Running GraphQL codegen on',
  });

  // Check if melos is installed
  ensureCondition(
    isCommandInstalled('melos'),
    verbose ? '⚠️  Warning: Melos not installed, skipping' : '',
    { exitCode: 0 }
  );

  // Get git status before running codegen
  const gitStatusBefore = getGitStatus(cwd);

  ensureCondition(gitStatusBefore !== null, 'Error: Failed to get git status');

  logIfVerbose(verbose, '🔧 Running GraphQL code generation...');

  /* v8 ignore next -- @preserve */
  // Run the code generation commands
  try {
    for (const command of codegenCommands) {
      execSync(command, {
        cwd,
        env: withoutGitRepositoryEnv(),
        stdio: verbose ? 'inherit' : 'pipe',
      });
    }
  } catch (error) {
    console.error('Error: Failed to run GraphQL code generation');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }

  // Get git status after running codegen
  /* v8 ignore next -- @preserve */
  const gitStatusAfter = getGitStatus(cwd);

  /* v8 ignore next -- @preserve */
  ensureCondition(gitStatusAfter !== null, 'Error: Failed to get git status');

  // Compare git status before and after
  // TypeScript knows these are non-null after ensureCondition checks
  // Using type guards instead of assertions for better safety
  /* v8 ignore next -- @preserve */
  if (gitStatusBefore && gitStatusAfter && gitStatusBefore !== gitStatusAfter) {
    console.error('');
    console.error('⚠️  WARNING: GraphQL fakes need regeneration!');
    console.error('   Modified files:');

    // Show what changed by comparing git status outputs
    /* v8 ignore next -- @preserve */
    try {
      // Parse the status outputs to show what changed
      const beforeLines = new Set(gitStatusBefore.split('\n').filter((line) => line.length > 0));
      const afterLines = gitStatusAfter.split('\n').filter((line) => line.length > 0);

      // Find files that are new or have different status
      const changedFiles = afterLines.filter((line) => !beforeLines.has(line));

      if (changedFiles.length > 0) {
        changedFiles.forEach((line) => {
          // Extract just the filename from the porcelain format (e.g., "?? file.dart" or "M  file.dart")
          const match = line.match(/^..\s+(.+)$/);
          if (match && match[1]) {
            console.error(`   ${match[1]}`);
          }
        });
      } else {
        console.error('   (Unable to determine changed files)');
      }
    } catch {
      // If parsing fails, just show a generic message
      console.error('   (Unable to determine changed files)');
    }

    console.error('');
    console.error(
      `   Run 'melos run codegen:graphql && melos run codegen:graphql:test' and commit changes`
    );
    process.exit(1);
  }

  logIfVerbose(verbose, '✓ GraphQL fakes are up to date');
  process.exit(0);
}
