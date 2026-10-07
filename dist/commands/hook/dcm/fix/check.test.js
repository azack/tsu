import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dartHookDcmCheck } from './check.js';
import * as gitUtils from '../../../git/utils/git.js';
import * as dartUtils from '../../../dart/utils/dart.js';
import * as shellUtils from '../../../../utils/shell.js';
import { execSync } from 'node:child_process';
import { resetVerbose } from '../../../../utils/verbose-state.js';
vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
}));
describe('dartHookDcmCheck', () => {
    let consoleErrorSpy;
    let processExitSpy;
    let isGitRepoSpy;
    let isDartPackageSpy;
    let getAllChangedFilesSpy;
    let isCommandInstalledSpy;
    beforeEach(() => {
        resetVerbose();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`process.exit(${code})`);
        });
        isGitRepoSpy = vi.spyOn(gitUtils, 'isGitRepo');
        isDartPackageSpy = vi.spyOn(dartUtils, 'isDartPackage');
        getAllChangedFilesSpy = vi.spyOn(gitUtils, 'getAllChangedFiles');
        isCommandInstalledSpy = vi.spyOn(shellUtils, 'isCommandInstalled');
        isCommandInstalledSpy.mockReturnValue(true);
        vi.mocked(execSync).mockReturnValue('');
    });
    afterEach(() => {
        consoleErrorSpy.mockRestore();
        processExitSpy.mockRestore();
        isGitRepoSpy.mockRestore();
        isDartPackageSpy.mockRestore();
        getAllChangedFilesSpy.mockRestore();
        isCommandInstalledSpy.mockRestore();
        vi.clearAllMocks();
    });
    it('should exit with error if not in a git repository', () => {
        isGitRepoSpy.mockReturnValue(false);
        expect(() => {
            dartHookDcmCheck({ verbose: false });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a git repository');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it('should exit with error if not in a Dart package', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(false);
        expect(() => {
            dartHookDcmCheck({ verbose: false });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a Dart package');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it('should exit with success if no Dart source files modified', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue([]);
        expect(() => {
            dartHookDcmCheck({ verbose: true });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('✓ No Dart source files modified');
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should exit with success if only generated files are modified', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue([
            'lib/models/user.g.dart',
            'lib/models/user.freezed.dart',
            'lib/graphql/query.gql.dart',
        ]);
        expect(() => {
            dartHookDcmCheck({ verbose: true });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('✓ No Dart source files modified');
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should use provided files when files option is given', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue([]);
        expect(() => {
            dartHookDcmCheck({ verbose: true });
        }).toThrow('process.exit(0)');
        expect(getAllChangedFilesSpy).toHaveBeenCalled();
    });
    it('should run dcm fix without the git repository variables a worktree hook exports', () => {
        vi.stubEnv('GIT_DIR', '/repo/.git/worktrees/feature');
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['lib/main.dart']);
        const hasUnstagedChangesSpy = vi.spyOn(gitUtils, 'hasUnstagedChanges').mockReturnValue(false);
        expect(() => {
            dartHookDcmCheck({});
        }).toThrow('process.exit(0)');
        const fixCall = vi
            .mocked(execSync)
            .mock.calls.find(([command]) => String(command).startsWith('dcm fix '));
        expect(fixCall?.[1]?.env).toBeDefined();
        expect(fixCall?.[1]?.env?.GIT_DIR).toBeUndefined();
        hasUnstagedChangesSpy.mockRestore();
        vi.unstubAllEnvs();
    });
    it('should display file list in verbose mode when running dcm fix', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['lib/main.dart']);
        const hasUnstagedChangesSpy = vi.spyOn(gitUtils, 'hasUnstagedChanges').mockReturnValue(false);
        expect(() => {
            dartHookDcmCheck({ verbose: true });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Running DCM fix on 1 file(s):');
        expect(consoleErrorSpy).toHaveBeenCalledWith('  lib/main.dart');
        hasUnstagedChangesSpy.mockRestore();
    });
});
