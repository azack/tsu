import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dartFix } from './fix.js';
import * as dartUtils from './utils/dart.js';
import * as shellUtils from '../../utils/shell.js';
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
}));
vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    statSync: vi.fn(),
}));
describe('dartFix', () => {
    let consoleErrorSpy;
    let processExitSpy;
    let isCommandInstalledSpy;
    let escapeShellArgSpy;
    let findAffectedPackagesSpy;
    let existsSyncSpy;
    let statSyncSpy;
    let readPackageNameSpy;
    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`process.exit(${code})`);
        });
        isCommandInstalledSpy = vi.spyOn(shellUtils, 'isCommandInstalled');
        escapeShellArgSpy = vi
            .spyOn(shellUtils, 'escapeShellArg')
            .mockImplementation((arg) => `'${arg}'`);
        findAffectedPackagesSpy = vi.spyOn(dartUtils, 'findAffectedPackages');
        readPackageNameSpy = vi.spyOn(dartUtils, 'readPackageName');
        existsSyncSpy = vi.mocked(existsSync);
        statSyncSpy = vi.mocked(statSync);
    });
    afterEach(() => {
        consoleErrorSpy.mockRestore();
        processExitSpy.mockRestore();
        isCommandInstalledSpy.mockRestore();
        escapeShellArgSpy.mockRestore();
        findAffectedPackagesSpy.mockRestore();
        readPackageNameSpy.mockRestore();
        vi.clearAllMocks();
    });
    it('should exit with success if dart is not installed', () => {
        isCommandInstalledSpy.mockReturnValue(false);
        expect(() => {
            dartFix({ verbose: true, files: ['test.dart'] });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('⚠️  Warning: dart not installed, skipping');
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should exit with error if no files provided', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        expect(() => {
            dartFix({ verbose: true });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error: No files provided. Use --files to specify files or package directories to check.');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it.skip('should run dart fix on individual files by default', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => false });
        vi.mocked(execSync).mockImplementation(() => 'No issues found');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['lib/main.dart', 'lib/utils.dart'],
            });
        }).toThrow('process.exit(0)');
        expect(execSync).toHaveBeenCalledWith(expect.stringMatching(/^dart fix --dry-run.*lib\/main\.dart.*lib\/utils\.dart$/), expect.objectContaining({ cwd: expect.any(String) }));
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should run dart fix on packages when --packages flag is used', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        findAffectedPackagesSpy.mockReturnValue(new Map([
            ['packages/app', 'app'],
            ['packages/core', 'core'],
        ]));
        existsSyncSpy.mockReturnValue(true);
        vi.mocked(execSync).mockReturnValue('No issues found!');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/app/lib/main.dart', 'packages/core/lib/utils.dart'],
                packages: true,
            });
        }).toThrow('process.exit(0)');
        expect(execSync).toHaveBeenCalledWith('dart fix --dry-run', expect.objectContaining({ cwd: expect.stringContaining('packages/app') }));
        expect(execSync).toHaveBeenCalledWith('dart fix --dry-run', expect.objectContaining({ cwd: expect.stringContaining('packages/core') }));
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should run dart fix on packages without the git repository variables a worktree hook exports', () => {
        vi.stubEnv('GIT_DIR', '/repo/.git/worktrees/feature');
        isCommandInstalledSpy.mockReturnValue(true);
        findAffectedPackagesSpy.mockReturnValue(new Map([['packages/app', 'app']]));
        existsSyncSpy.mockReturnValue(true);
        vi.mocked(execSync).mockReturnValue('No issues found!');
        expect(() => {
            dartFix({ files: ['packages/app/lib/main.dart'], packages: true });
        }).toThrow('process.exit(0)');
        const fixCall = vi
            .mocked(execSync)
            .mock.calls.find(([command]) => String(command).startsWith('dart fix'));
        expect(fixCall?.[1]?.env).toBeDefined();
        expect(fixCall?.[1]?.env?.GIT_DIR).toBeUndefined();
        vi.unstubAllEnvs();
    });
    it.skip('should run dart fix with --apply when apply option is true', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => false });
        vi.mocked(execSync).mockReturnValue('Fixed 2 issues');
        expect(() => {
            dartFix({ verbose: true, apply: true, files: ['lib/main.dart'] });
        }).toThrow('process.exit(0)');
        expect(execSync).toHaveBeenCalledWith(expect.stringMatching(/^dart fix --apply.*lib\/main\.dart$/), expect.objectContaining({ cwd: expect.any(String) }));
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should exit with error if fixes are suggested in dry-run mode', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => false });
        vi.mocked(execSync).mockReturnValue('3 suggested fixes available');
        expect(() => {
            dartFix({ verbose: true, files: ['lib/main.dart'] });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('⚠️  Suggested fixes available');
        expect(consoleErrorSpy).toHaveBeenCalledWith('💡 Run with --apply to automatically apply fixes');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it('should exit with error if dart fix command fails', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => false });
        vi.mocked(execSync).mockImplementation(() => {
            throw new Error('dart fix failed');
        });
        expect(() => {
            dartFix({ verbose: true, files: ['lib/main.dart'] });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ dart fix failed');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it.skip('should handle specific files', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => false });
        vi.mocked(execSync).mockReturnValue('No issues found');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['lib/main.dart'],
            });
        }).toThrow('process.exit(0)');
        expect(execSync).toHaveBeenCalledWith(expect.stringMatching(/^dart fix --dry-run.*lib\/main\.dart$/), expect.objectContaining({ cwd: expect.any(String) }));
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should exit with error if package path does not exist when using --packages', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        findAffectedPackagesSpy.mockReturnValue(new Map([['packages/app', 'app']]));
        existsSyncSpy.mockReturnValue(false);
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/app/lib/main.dart'],
                packages: true,
            });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error: Package path not found'));
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it('should exit with success if no affected packages found when using --packages', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        findAffectedPackagesSpy.mockReturnValue(new Map());
        expect(() => {
            dartFix({ verbose: true, files: ['README.md'], packages: true });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('✓ No Dart packages to check with dart fix');
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should run dart fix on package directories directly', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => true });
        existsSyncSpy.mockReturnValue(true);
        readPackageNameSpy.mockReturnValue('my_package');
        vi.mocked(execSync).mockReturnValue('No issues found');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/my_package'],
            });
        }).toThrow('process.exit(0)');
        expect(readPackageNameSpy).toHaveBeenCalled();
        expect(execSync).toHaveBeenCalledWith('dart fix --dry-run', expect.objectContaining({
            cwd: expect.stringContaining('packages/my_package'),
        }));
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it.skip('should handle package directories with regular files', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy
            .mockReturnValueOnce({ isDirectory: () => true })
            .mockReturnValue({ isDirectory: () => false });
        existsSyncSpy.mockReturnValue(true);
        readPackageNameSpy.mockReturnValue('my_package');
        vi.mocked(execSync).mockReturnValue('No issues found');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/my_package', 'lib/main.dart'],
            });
        }).toThrow('process.exit(0)');
        expect(execSync).toHaveBeenCalledTimes(2);
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it.skip('should handle package directories with regular files using --packages flag', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy
            .mockReturnValueOnce({ isDirectory: () => true })
            .mockReturnValue({ isDirectory: () => false });
        existsSyncSpy.mockReturnValue(true);
        readPackageNameSpy.mockReturnValue('my_package');
        findAffectedPackagesSpy.mockReturnValue(new Map([['packages/other', 'other']]));
        vi.mocked(execSync).mockReturnValue('No issues found');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/my_package', 'lib/main.dart'],
                packages: true,
            });
        }).toThrow('process.exit(0)');
        expect(execSync).toHaveBeenCalledTimes(2);
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should warn if package name cannot be read from package directory', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => true });
        existsSyncSpy.mockReturnValue(true);
        readPackageNameSpy.mockReturnValue(null);
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/broken_package'],
            });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️  Warning: Could not read package name'));
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it.skip('should handle isPackageDirectory errors gracefully', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockImplementation(() => {
            throw new Error('Permission denied');
        });
        vi.mocked(execSync).mockReturnValue('No issues found');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['lib/main.dart'],
            });
        }).toThrow('process.exit(0)');
        expect(execSync).toHaveBeenCalled();
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it.skip('should exit with error if package has suggested fixes in package mode', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        findAffectedPackagesSpy.mockReturnValue(new Map([['packages/app', 'app']]));
        existsSyncSpy.mockReturnValue(true);
        vi.mocked(execSync).mockReturnValue('3 suggested fixes available');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/app/lib/main.dart'],
                packages: true,
            });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('⚠️  app has suggested fixes available');
        expect(consoleErrorSpy).toHaveBeenCalledWith('💡 Run with --apply to automatically apply fixes');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it.skip('should handle execSync errors with stdout/stderr in package mode', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        findAffectedPackagesSpy.mockReturnValue(new Map([['packages/app', 'app']]));
        existsSyncSpy.mockReturnValue(true);
        const error = new Error('Command failed');
        error.stdout = 'stdout output';
        error.stderr = 'stderr output';
        vi.mocked(execSync).mockImplementation(() => {
            throw error;
        });
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/app/lib/main.dart'],
                packages: true,
            });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ app dart fix failed');
        expect(consoleErrorSpy).toHaveBeenCalledWith('stdout output');
        expect(consoleErrorSpy).toHaveBeenCalledWith('stderr output');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it('should handle execSync errors with stdout/stderr in file mode', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => false });
        const error = new Error('Command failed');
        error.stdout = 'stdout output';
        error.stderr = 'stderr output';
        vi.mocked(execSync).mockImplementation(() => {
            throw error;
        });
        expect(() => {
            dartFix({
                verbose: true,
                files: ['lib/main.dart'],
            });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ dart fix failed');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it.skip('should output verbose messages for successful dry-run with results', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        statSyncSpy.mockReturnValue({ isDirectory: () => false });
        vi.mocked(execSync).mockReturnValue('Analyzing lib/main.dart\n');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['lib/main.dart'],
            });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('✓ All dart fix checks passed');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Analyzing lib/main.dart\n');
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should output verbose messages for successful package fix with results', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        findAffectedPackagesSpy.mockReturnValue(new Map([['packages/app', 'app']]));
        existsSyncSpy.mockReturnValue(true);
        vi.mocked(execSync).mockReturnValue('Analyzing package\n');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/app/lib/main.dart'],
                packages: true,
            });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('✓ app dart fix passed');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Analyzing package\n');
        expect(consoleErrorSpy).toHaveBeenCalledWith('✓ All dart fix checks passed');
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should run with apply flag in package mode', () => {
        isCommandInstalledSpy.mockReturnValue(true);
        findAffectedPackagesSpy.mockReturnValue(new Map([['packages/app', 'app']]));
        existsSyncSpy.mockReturnValue(true);
        vi.mocked(execSync).mockReturnValue('Applied 3 fixes');
        expect(() => {
            dartFix({
                verbose: true,
                files: ['packages/app/lib/main.dart'],
                packages: true,
                apply: true,
            });
        }).toThrow('process.exit(0)');
        expect(execSync).toHaveBeenCalledWith('dart fix --apply', expect.objectContaining({ cwd: expect.stringContaining('packages/app') }));
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
});
