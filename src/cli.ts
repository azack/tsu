#!/usr/bin/env node
import { Command } from 'commander';
import { parsePositiveInt } from './utils/parse-positive-int.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { gitCheck } from './commands/git/check.js';
import { gitRoot } from './commands/git/root.js';
import { gitChanged } from './commands/git/changed.js';
import { gitBranch } from './commands/git/branch.js';
import { gitIsMain } from './commands/git/is-main.js';
import { gitCommitMsg } from './commands/git/commit-msg.js';
import { gitPRDescription } from './commands/git/pr-description.js';
import { gitCodeownersCheck } from './commands/git/codeowners/check.js';
import { filesFilter } from './commands/files/filter/suffix.js';
import { dartCheck } from './commands/dart/check.js';
import { dartRoot } from './commands/dart/root.js';
import { dartPackage } from './commands/dart/package.js';
import { dartChanged } from './commands/dart/changed/index.js';
import { dartChangedDownstream } from './commands/dart/changed/downstream.js';
import { dartHookFormatCheck } from './commands/hook/format/check.js';
import { dartHookAnalysisCheck } from './commands/hook/analysis/check.js';
import { dartHookFixCheck } from './commands/hook/fix/check.js';
import { dartHookDcmCheck } from './commands/hook/dcm/fix/check.js';
import {
  dartHookDcmAnalyzeCheck,
  DEFAULT_HOOK_DCM_TIMEOUT_MS,
} from './commands/hook/dcm/analyze/check.js';
import { dartHookGraphqlCheck } from './commands/hook/graphql/check.js';
import { hookCollate } from './commands/hook/collate.js';
import { dartFix } from './commands/dart/fix.js';
import { dartDcmAnalyze } from './commands/dart/dcm/analyze.js';
import { checkExternals } from './commands/check/externals.js';
import { checkVersion } from './commands/check/version.js';
import { upgrade } from './commands/upgrade.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program.name('tsu').description('TypeScript command line utilities').version(packageJson.version);

// Check subcommand namespace
const check = program.command('check').description('Check system dependencies and environment');

check
  .command('externals')
  .description('Check if external dependencies (dart, dcm, melos, claude) are installed')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action((options: { verbose?: boolean }) => {
    checkExternals(options);
  });

check
  .command('version')
  .description('Check if tsu is on the most recent version')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action(async (options: { verbose?: boolean }) => {
    await checkVersion(options);
  });

// Upgrade command
program
  .command('upgrade')
  .description('Upgrade tsu to the latest version from GitHub')
  .option('-v, --verbose', 'show progress messages (output to stderr)')
  .option(
    '-p, --package-manager <manager>',
    'package manager to use (npm, pnpm, or yarn; default: detected from the installed tsu, else pnpm)'
  )
  .action(async (options: { verbose?: boolean; packageManager?: 'npm' | 'pnpm' | 'yarn' }) => {
    await upgrade(options);
  });

// Git subcommand namespace
const git = program.command('git').description('Git repository utilities');

git
  .command('check')
  .description('Check if current directory is in a git repository (exit code only)')
  .argument('[path]', 'path to check (defaults to current directory)')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action((path: string | undefined, options: { verbose?: boolean }) => {
    gitCheck(path, options);
  });

git
  .command('root')
  .description('Get the root directory of the git repository')
  .argument('[path]', 'path to check (defaults to current directory)')
  .option('-v, --verbose', 'show human-readable label (output to stderr)')
  .action((path: string | undefined, options: { verbose?: boolean }) => {
    gitRoot(path, options);
  });

git
  .command('changed')
  .description('Show files that have changed compared to main branch')
  .option('-s, --staged', 'show staged changes only')
  .option('-u, --unstaged', 'show unstaged changes only')
  .option('-a, --all', 'show all changes (committed, staged, and unstaged)')
  .option('-p, --push', 'show files in commits that would be pushed to upstream')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('-v, --verbose', 'show headers and counts (output to stderr)')
  .action(
    (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      push?: boolean;
      baseBranch?: string;
      verbose?: boolean;
    }) => {
      gitChanged(options);
    }
  );

git
  .command('branch')
  .description('Get the current git branch name')
  .argument('[path]', 'path to check (defaults to current directory)')
  .option('-v, --verbose', 'show human-readable label (output to stderr)')
  .action((path: string | undefined, options: { verbose?: boolean }) => {
    gitBranch(path, options);
  });

git
  .command('is-main')
  .description('Check if current branch is main (exit code only)')
  .argument('[path]', 'path to check (defaults to current directory)')
  .option('-b, --branch <name>', 'main branch name to check against', 'main')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action((path: string | undefined, options: { verbose?: boolean; branch?: string }) => {
    gitIsMain(path, options);
  });

git
  .command('commit-msg')
  .description('Generate a commit message from staged changes using Claude')
  .option('-c, --commit', 'automatically create the commit with generated message')
  .option('-v, --verbose', 'show progress messages (output to stderr)')
  .action((options: { commit?: boolean; verbose?: boolean }) => {
    gitCommitMsg(options);
  });

git
  .command('pr-description')
  .description('Generate a GitHub PR description from branch changes using Claude')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('-v, --verbose', 'show progress messages (output to stderr)')
  .action((options: { baseBranch?: string; verbose?: boolean }) => {
    gitPRDescription(options);
  });

// Git codeowners subcommand namespace
const gitCodeowners = git.command('codeowners').description('CODEOWNERS file utilities');

gitCodeowners
  .command('check')
  .description('Check if CODEOWNERS files are in sync (suitable for CI checks)')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action((options: { verbose?: boolean }) => {
    gitCodeownersCheck(options);
  });

// Files subcommand namespace
const files = program.command('files').description('File manipulation utilities');

const filesFilterCmd = files.command('filter').description('Filter files from stdin');

filesFilterCmd
  .command('suffix')
  .description('Filter files by removing those matching suffix patterns')
  .argument('<suffixes...>', 'suffix patterns to filter out (e.g., .g.dart .gql.dart)')
  .option('-v, --verbose', 'show filter statistics (output to stderr)')
  .action((suffixes: string[], options: { verbose?: boolean }) => {
    filesFilter(suffixes, options);
  });

// Dart subcommand namespace
const dart = program.command('dart').description('Dart package utilities');

dart
  .command('check')
  .description('Check if current directory is in a Dart package (exit code only)')
  .argument('[path]', 'path to check (defaults to current directory)')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action((path: string | undefined, options: { verbose?: boolean }) => {
    dartCheck(path, options);
  });

dart
  .command('root')
  .description('Get the root directory of the Dart package')
  .argument('[path]', 'path to check (defaults to current directory)')
  .option('-v, --verbose', 'show human-readable label (output to stderr)')
  .action((path: string | undefined, options: { verbose?: boolean }) => {
    dartRoot(path, options);
  });

dart
  .command('package')
  .description('Get the package root containing a specific file (useful in mono-repos)')
  .argument('<file>', 'path to the file')
  .option('-v, --verbose', 'show human-readable label (output to stderr)')
  .action((file: string, options: { verbose?: boolean }) => {
    dartPackage(file, options);
  });

// Dart changed subcommand
const dartChangedCmd = dart.command('changed').description('Show Dart files that have changed');

dartChangedCmd
  .description('Show Dart files that have changed compared to main branch')
  .option('-s, --staged', 'show staged changes only')
  .option('-u, --unstaged', 'show unstaged changes only')
  .option('-a, --all', 'show all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('-v, --verbose', 'show headers and counts (output to stderr)')
  .action(
    (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      verbose?: boolean;
    }) => {
      dartChanged(options);
    }
  );

dartChangedCmd
  .command('downstream')
  .description('Find all Dart files that depend on changed Dart files')
  .option('-s, --staged', 'analyze staged changes only')
  .option('-u, --unstaged', 'analyze unstaged changes only')
  .option('-a, --all', 'analyze all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('--relative', 'output relative paths instead of absolute paths')
  .option('-v, --verbose', 'show detailed progress information (output to stderr)')
  .action(
    (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      relative?: boolean;
      verbose?: boolean;
    }) => {
      dartChangedDownstream(options);
    }
  );

dart
  .command('fix')
  .description('Run dart fix (dry-run by default)')
  .option('-v, --verbose', 'show detailed progress information')
  .option('-f, --files <files...>', 'specific files or directories to check')
  .option('--apply', 'apply fixes automatically (default is dry-run)')
  .option('--packages', 'run on affected packages instead of individual files')
  .action(
    (options: { verbose?: boolean; files?: string[]; apply?: boolean; packages?: boolean }) => {
      dartFix(options);
    }
  );

// Dart DCM subcommand namespace
const dartDcm = dart.command('dcm').description('DCM code quality utilities');

dartDcm
  .command('analyze')
  .description('Run DCM analyze and output files with issues')
  .option('-v, --verbose', 'show detailed progress information')
  .option('--timeout <ms>', 'timeout in milliseconds', parsePositiveInt, 7000)
  .action((options: { verbose?: boolean; timeout?: number }) => {
    dartDcmAnalyze(options);
  });

// Hook subcommand namespace
const hook = program.command('hook').description('Git hook utilities for Dart');

hook
  .command('format')
  .command('check')
  .description('Check if Dart files are properly formatted (suitable for pre-push hooks)')
  .option('-s, --staged', 'check staged changes only')
  .option('-u, --unstaged', 'check unstaged changes only')
  .option('-a, --all', 'check all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action(
    (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      verbose?: boolean;
    }) => {
      dartHookFormatCheck(options);
    }
  );

hook
  .command('analysis')
  .command('check')
  .description('Check if Dart files pass dart analyze (suitable for pre-push hooks)')
  .option('-s, --staged', 'check staged changes only')
  .option('-u, --unstaged', 'check unstaged changes only')
  .option('-a, --all', 'check all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action(
    (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      verbose?: boolean;
    }) => {
      dartHookAnalysisCheck(options);
    }
  );

hook
  .command('fix')
  .command('check')
  .description('Check if Dart files pass dart fix and apply fixes (suitable for pre-push hooks)')
  .option('-s, --staged', 'check staged changes only')
  .option('-u, --unstaged', 'check unstaged changes only')
  .option('-a, --all', 'check all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action(
    (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      verbose?: boolean;
    }) => {
      dartHookFixCheck(options);
    }
  );

// Hook DCM subcommand namespace
const hookDcm = hook.command('dcm').description('DCM utilities for Dart code quality');

hookDcm
  .command('fix')
  .command('check')
  .description('Check if Dart files pass DCM fix checks (suitable for pre-push hooks)')
  .option('-s, --staged', 'check staged changes only')
  .option('-u, --unstaged', 'check unstaged changes only')
  .option('-a, --all', 'check all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action(
    (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      verbose?: boolean;
    }) => {
      dartHookDcmCheck(options);
    }
  );

hookDcm
  .command('analyze')
  .command('check')
  .description('Check if Dart files pass DCM analyze checks (suitable for pre-push hooks)')
  .option('-s, --staged', 'check staged changes only')
  .option('-u, --unstaged', 'check unstaged changes only')
  .option('-a, --all', 'check all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option(
    '--timeout <ms>',
    'timeout in milliseconds',
    parsePositiveInt,
    DEFAULT_HOOK_DCM_TIMEOUT_MS
  )
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action(
    (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      timeout?: number;
      verbose?: boolean;
    }) => {
      dartHookDcmAnalyzeCheck(options);
    }
  );

hook
  .command('graphql')
  .command('check')
  .description('Check if GraphQL fakes are up to date (suitable for pre-push hooks)')
  .option('-s, --staged', 'check staged changes only')
  .option('-u, --unstaged', 'check unstaged changes only')
  .option('-a, --all', 'check all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action(
    async (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      verbose?: boolean;
    }) => {
      await dartHookGraphqlCheck(options);
    }
  );

hook
  .command('collate')
  .description('Run multiple hook checks and track failures (suitable for pre-push hooks)')
  .option('-s, --staged', 'check staged changes only')
  .option('-u, --unstaged', 'check unstaged changes only')
  .option('-a, --all', 'check all changes (committed, staged, and unstaged)')
  .option('-b, --base-branch <branch>', 'base branch to compare against', 'main')
  .option('--dart-format', 'run dart format check')
  .option('--dart-analysis', 'run dart analysis check')
  .option('--dcm-analyze', 'run DCM analyze check')
  .option('--graphql', 'run GraphQL check')
  .option('--codeowners', 'run git codeowners check')
  .option('-v, --verbose', 'show human-readable status messages (output to stderr)')
  .action(
    async (options: {
      staged?: boolean;
      unstaged?: boolean;
      all?: boolean;
      baseBranch?: string;
      dartFormat?: boolean;
      dartAnalysis?: boolean;
      dcmAnalyze?: boolean;
      graphql?: boolean;
      codeowners?: boolean;
      verbose?: boolean;
    }) => {
      await hookCollate(options);
    }
  );

program.parse();
