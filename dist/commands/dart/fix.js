import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { ensureCondition, ensureDartInstalled } from '../../utils/command-helpers.js';
import { escapeShellArg } from '../../utils/shell.js';
import { findAffectedPackages, readPackageName } from './utils/dart.js';
import { logIfVerbose } from '../../utils/logger.js';
import { withoutGitRepositoryEnv } from '../../utils/without-git-repository-env.js';
export function dartFix(options = {}) {
    const verbose = options.verbose || false;
    const apply = options.apply || false;
    const usePackages = options.packages || false;
    const files = options.files || [];
    ensureDartInstalled(verbose);
    ensureCondition(files.length > 0, 'Error: No files provided. Use --files to specify files or package directories to check.', { exitCode: 1 });
    const cwd = process.cwd();
    const packageDirs = [];
    const regularFiles = [];
    for (const file of files) {
        const absolutePath = resolve(cwd, file);
        if (isPackageDirectory(absolutePath)) {
            packageDirs.push(absolutePath);
        }
        else {
            regularFiles.push(file);
        }
    }
    const hasPackageDirs = packageDirs.length > 0;
    const hasRegularFiles = regularFiles.length > 0;
    logIfVerbose(verbose, `🔧 Running dart fix ${apply ? '(applying fixes)' : '(dry-run)'}...`);
    if (hasPackageDirs) {
        const packages = new Map();
        for (const pkgDir of packageDirs) {
            const packageName = readPackageName(pkgDir);
            if (packageName) {
                const relativePath = pkgDir.startsWith(cwd) ? pkgDir.substring(cwd.length + 1) : pkgDir;
                packages.set(relativePath, packageName);
            }
            else {
                console.error(`⚠️  Warning: Could not read package name from ${pkgDir}`);
            }
        }
        if (packages.size > 0) {
            runFixOnPackages(packages, cwd, verbose, apply);
        }
        if (hasRegularFiles) {
            if (usePackages) {
                const affectedPackages = findAffectedPackages(regularFiles, cwd);
                if (affectedPackages.size > 0) {
                    runFixOnPackages(affectedPackages, cwd, verbose, apply);
                }
            }
            else {
                runFixOnFiles(regularFiles, cwd, verbose, apply);
            }
        }
        if (verbose) {
            console.error('✓ All dart fix checks passed');
        }
        process.exit(0);
    }
    if (usePackages) {
        const affectedPackages = findAffectedPackages(regularFiles, cwd);
        if (affectedPackages.size === 0) {
            if (verbose) {
                console.error('✓ No Dart packages to check with dart fix');
            }
            process.exit(0);
        }
        runFixOnPackages(affectedPackages, cwd, verbose, apply);
    }
    else {
        runFixOnFiles(regularFiles, cwd, verbose, apply);
    }
}
function runFixOnFiles(files, cwd, verbose, apply) {
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
        handleSuggestedFixes(apply, result, verbose);
        if (verbose) {
            console.error('✓ All dart fix checks passed');
            if (result.trim()) {
                console.error(result);
            }
        }
        process.exit(0);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'FIXES_AVAILABLE') {
            console.error('');
            console.error('💡 Run with --apply to automatically apply fixes');
            process.exit(1);
        }
        console.error('❌ dart fix failed');
        if (verbose && error instanceof Error) {
            const execError = error;
            if (execError.stdout)
                console.error(execError.stdout);
            if (execError.stderr)
                console.error(execError.stderr);
        }
        process.exit(1);
    }
}
function runFixOnPackages(packages, cwd, verbose, apply) {
    let hasErrors = false;
    for (const [location, packageName] of packages) {
        logIfVerbose(verbose, `Running dart fix ${apply ? '(applying) ' : '(dry-run) '}on ${packageName}...`);
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
            try {
                handleSuggestedFixes(apply, result, verbose, packageName);
            }
            catch (error) {
                if (error instanceof Error && error.message === 'FIXES_AVAILABLE') {
                    hasErrors = true;
                }
                else {
                    throw error;
                }
            }
            if (!hasErrors && verbose) {
                logIfVerbose(verbose, `✓ ${packageName} dart fix passed`);
                if (result.trim()) {
                    console.error(result);
                }
            }
        }
        catch (error) {
            if (error instanceof Error && error.message === 'FIXES_AVAILABLE') {
                hasErrors = true;
            }
            else {
                console.error(`❌ ${packageName} dart fix failed`);
                if (verbose && error instanceof Error) {
                    const execError = error;
                    if (execError.stdout)
                        console.error(execError.stdout);
                    if (execError.stderr)
                        console.error(execError.stderr);
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
function isPackageDirectory(path) {
    try {
        const stat = statSync(path);
        if (!stat.isDirectory()) {
            return false;
        }
        const pubspecPath = join(path, 'pubspec.yaml');
        return existsSync(pubspecPath);
    }
    catch {
        return false;
    }
}
function handleSuggestedFixes(apply, result, verbose, packageName) {
    if (!apply && result.includes('suggested fixes')) {
        if (packageName) {
            console.error(`⚠️  ${packageName} has suggested fixes available`);
        }
        else {
            console.error('⚠️  Suggested fixes available');
        }
        if (verbose) {
            console.error(result);
        }
        throw new Error('FIXES_AVAILABLE');
    }
}
