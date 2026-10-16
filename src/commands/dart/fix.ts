import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { ensureCondition, ensureDartInstalled } from '../../utils/command-helpers.js';
import { escapeShellArg } from '../../utils/shell.js';
import { findAffectedPackages, readPackageName } from './utils/dart.js';
import { logIfVerbose } from '../../utils/logger.js';
import { withoutGitRepositoryEnv } from '../../utils/without-git-repository-env.js';

export interface DartFixOptions {
  verbose?: boolean;
  /** Files or directories to check (required) */
  files?: string[];
  /** Apply fixes automatically (default: false, just dry-run) */
  apply?: boolean;
  /** Run on packages instead of individual files (default: false) */
  packages?: boolean;
}

/**
 * Runs `dart fix` on Dart code.
 *
 * Supports three modes:
 * 1. User provides package directories: Runs on those packages directly
 * 2. User provides files with --packages flag: Infers packages from files and runs on packages
 * 3. User provides files without --packages: Runs on individual files
 *
 * By default runs in dry-run mode (--dry-run), use --apply to actually apply fixes.
 */
export function dartFix(options: DartFixOptions = {}): void {
  const verbose = options.verbose || false;
  const apply = options.apply || false;
  const usePackages = options.packages || false;
  const files = options.files || [];

  // Check if dart is installed
  ensureDartInstalled(verbose);

  // Check that files were provided
  ensureCondition(
    files.length > 0,
    'Error: No files provided. Use --files to specify files or package directories to check.',
    { exitCode: 1 }
  );

  const cwd = process.cwd();

  // Separate package directories from regular files
  const packageDirs: string[] = [];
  const regularFiles: string[] = [];

  for (const file of files) {
    const absolutePath = resolve(cwd, file);
    if (isPackageDirectory(absolutePath)) {
      packageDirs.push(absolutePath);
    } else {
      regularFiles.push(file);
    }
  }

  // Determine which mode to run in
  const hasPackageDirs = packageDirs.length > 0;
  const hasRegularFiles = regularFiles.length > 0;

  logIfVerbose(verbose, `🔧 Running dart fix ${apply ? '(applying fixes)' : '(dry-run)'}...`);

  // Mode 1: User provided package directories
  if (hasPackageDirs) {
    // Build package map from directories
    const packages = new Map<string, string>();
    for (const pkgDir of packageDirs) {
      const packageName = readPackageName(pkgDir);
      if (packageName) {
        // Convert to relative path for consistency
        const relativePath = pkgDir.startsWith(cwd) ? pkgDir.substring(cwd.length + 1) : pkgDir;
        packages.set(relativePath, packageName);
      } else {
        console.error(`⚠️  Warning: Could not read package name from ${pkgDir}`);
      }
    }

    if (packages.size > 0) {
      runFixOnPackages(packages, cwd, verbose, apply);
    }

    // If there are also regular files, handle them
    if (hasRegularFiles) {
      /* v8 ignore next -- @preserve */
      if (usePackages) {
        // Infer packages from files and run on packages
        const affectedPackages = findAffectedPackages(regularFiles, cwd);
        if (affectedPackages.size > 0) {
          runFixOnPackages(affectedPackages, cwd, verbose, apply);
        }
      } else {
        // Run on individual files
        runFixOnFiles(regularFiles, cwd, verbose, apply);
      }
    }

    if (verbose) {
      console.error('✓ All dart fix checks passed');
    }
    process.exit(0);
  }

  // Mode 2 & 3: User provided only files (no package directories)
  if (usePackages) {
    // Mode 2: Infer packages from files
    const affectedPackages = findAffectedPackages(regularFiles, cwd);

    if (affectedPackages.size === 0) {
      if (verbose) {
        console.error('✓ No Dart packages to check with dart fix');
      }
      process.exit(0);
    }

    runFixOnPackages(affectedPackages, cwd, verbose, apply);
  } else {
    // Mode 3: Run on individual files
    runFixOnFiles(regularFiles, cwd, verbose, apply);
  }
}

/**
 * Runs dart fix on individual files
 */
function runFixOnFiles(files: string[], cwd: string, verbose: boolean, apply: boolean): void {
  logIfVerbose(verbose, `Running dart fix on ${files.length} file(s)...`);

  try {
    const command = apply ? 'dart fix --apply' : 'dart fix --dry-run';
    const fileArgs = files.map(escapeShellArg).join(' ');
    const result = execSync(`${command} ${fileArgs}`, {
      cwd,
      env: withoutGitRepositoryEnv(),
      stdio: verbose ? 'pipe' : 'pipe',
      encoding: 'utf-8',
    });

    // Check if there are fixes available in dry-run mode
    handleSuggestedFixes(apply, result, verbose);

    /* v8 ignore next -- @preserve */
    if (verbose) {
      console.error('✓ All dart fix checks passed');
      if (result.trim()) {
        console.error(result);
      }
    }
    process.exit(0);
  } catch (error) {
    if (error instanceof Error && error.message === 'FIXES_AVAILABLE') {
      console.error('');
      console.error('💡 Run with --apply to automatically apply fixes');
      process.exit(1);
    }

    console.error('❌ dart fix failed');
    if (verbose && error instanceof Error) {
      const execError = error as { stdout?: string; stderr?: string };
      if (execError.stdout) console.error(execError.stdout);
      if (execError.stderr) console.error(execError.stderr);
    }
    process.exit(1);
  }
}

/**
 * Runs dart fix on packages
 */
function runFixOnPackages(
  packages: Map<string, string>,
  cwd: string,
  verbose: boolean,
  apply: boolean
): void {
  let hasErrors = false;

  for (const [location, packageName] of packages) {
    logIfVerbose(
      verbose,
      `Running dart fix ${apply ? '(applying) ' : '(dry-run) '}on ${packageName}...`
    );

    const packagePath = resolve(cwd, location);
    if (!existsSync(packagePath)) {
      console.error(`Error: Package path not found: ${packagePath}`);
      hasErrors = true;
      continue;
    }

    try {
      const command = apply ? 'dart fix --apply' : 'dart fix --dry-run';
      const result = execSync(command, {
        cwd: packagePath,
        env: withoutGitRepositoryEnv(),
        stdio: verbose ? 'pipe' : 'pipe',
        encoding: 'utf-8',
      });

      // Check if there are fixes available in dry-run mode
      try {
        handleSuggestedFixes(apply, result, verbose, packageName);
      } catch (error) {
        /* v8 ignore next -- @preserve */
        if (error instanceof Error && error.message === 'FIXES_AVAILABLE') {
          hasErrors = true;
        } else {
          throw error;
        }
      }

      if (!hasErrors && verbose) {
        logIfVerbose(verbose, `✓ ${packageName} dart fix passed`);
        if (result.trim()) {
          console.error(result);
        }
      }
    } catch (error) {
      /* v8 ignore next -- @preserve */
      if (error instanceof Error && error.message === 'FIXES_AVAILABLE') {
        hasErrors = true;
      } else {
        console.error(`❌ ${packageName} dart fix failed`);
        if (verbose && error instanceof Error) {
          const execError = error as { stdout?: string; stderr?: string };
          if (execError.stdout) console.error(execError.stdout);
          if (execError.stderr) console.error(execError.stderr);
        }
        hasErrors = true;
      }
    }
  }

  if (hasErrors) {
    if (!apply) {
      console.error('');
      console.error('💡 Run with --apply to automatically apply fixes');
    }
    process.exit(1);
  }

  logIfVerbose(verbose, '✓ All dart fix checks passed');
  process.exit(0);
}

/**
 * Checks if a path is a Dart package directory (contains pubspec.yaml)
 */
function isPackageDirectory(path: string): boolean {
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) {
      return false;
    }
    const pubspecPath = join(path, 'pubspec.yaml');
    return existsSync(pubspecPath);
  } catch {
    return false;
  }
}

/**
 * Handles the output when dart fix finds suggested fixes in dry-run mode.
 * Displays warnings and exits with error code.
 */
function handleSuggestedFixes(
  apply: boolean,
  result: string,
  verbose: boolean,
  packageName?: string
): void {
  if (!apply && result.includes('suggested fixes')) {
    if (packageName) {
      console.error(`⚠️  ${packageName} has suggested fixes available`);
    } else {
      console.error('⚠️  Suggested fixes available');
    }
    if (verbose) {
      console.error(result);
    }
    // Return true to indicate fixes were found
    throw new Error('FIXES_AVAILABLE');
  }
}
