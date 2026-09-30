import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dartHookDcmAnalyzeCheck } from './check.js';
import * as gitUtils from '../../../git/utils/git.js';
import * as dartUtils from '../../../dart/utils/dart.js';
import * as shellUtils from '../../../../utils/shell.js';
import * as dcmParse from '../../../../utils/dcm-parse.js';
import { resetVerbose } from '../../../../utils/verbose-state.js';
describe('dartHookDcmAnalyzeCheck', () => {
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
            dartHookDcmAnalyzeCheck({ verbose: false });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a git repository');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it('should exit with error if not in a Dart package', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(false);
        expect(() => {
            dartHookDcmAnalyzeCheck({ verbose: false });
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a Dart package');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it('should exit with success if no Dart source files modified', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue([]);
        expect(() => {
            dartHookDcmAnalyzeCheck({ verbose: true });
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
            dartHookDcmAnalyzeCheck({ verbose: true });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('✓ No Dart source files modified');
        expect(processExitSpy).toHaveBeenCalledWith(0);
    });
    it('should use provided files when files option is given', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue([]);
        expect(() => {
            dartHookDcmAnalyzeCheck({ verbose: true });
        }).toThrow('process.exit(0)');
        expect(getAllChangedFilesSpy).toHaveBeenCalled();
    });
    it('should run dcm analyze on dart files and exit with success when no issues', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['lib/main.dart', 'lib/models/user.dart']);
        const dcmAnalyzeSpy = vi.spyOn(dcmParse, 'dcmAnalyze').mockReturnValue({
            success: true,
            filesWithIssues: [],
            rawOutput: 'No issues found!',
        });
        expect(() => {
            dartHookDcmAnalyzeCheck({ verbose: true });
        }).toThrow('process.exit(0)');
        expect(dcmAnalyzeSpy).toHaveBeenCalledWith({
            cwd: expect.any(String),
            timeout: 20000,
            files: ['lib/main.dart', 'lib/models/user.dart'],
        });
        expect(consoleErrorSpy).toHaveBeenCalledWith('✓ All files pass DCM analyze checks');
        dcmAnalyzeSpy.mockRestore();
    });
    it('should display file list in verbose mode when analyzing files', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['lib/main.dart']);
        const dcmAnalyzeSpy = vi.spyOn(dcmParse, 'dcmAnalyze').mockReturnValue({
            success: true,
            filesWithIssues: [],
            rawOutput: 'No issues found!',
        });
        expect(() => {
            dartHookDcmAnalyzeCheck({ verbose: true });
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Running DCM analyze on 1 file(s):');
        expect(consoleErrorSpy).toHaveBeenCalledWith('  lib/main.dart');
        dcmAnalyzeSpy.mockRestore();
    });
    it('should exit with error when dcm analyze finds issues', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['lib/main.dart', 'lib/models/user.dart']);
        const dcmAnalyzeSpy = vi.spyOn(dcmParse, 'dcmAnalyze').mockReturnValue({
            success: false,
            filesWithIssues: ['lib/main.dart'],
            rawOutput: 'Issues found',
        });
        expect(() => {
            dartHookDcmAnalyzeCheck({ verbose: true });
        }).toThrow('process.exit(1)');
        expect(dcmAnalyzeSpy).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith('');
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Push blocked: DCM analyze found issues in the following file(s):');
        expect(consoleErrorSpy).toHaveBeenCalledWith('  lib/main.dart');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Run `dcm fix` to fix the issues.');
        expect(processExitSpy).toHaveBeenCalledWith(1);
        dcmAnalyzeSpy.mockRestore();
    });
    it('should pass a custom timeout to dcm analyze', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['lib/main.dart']);
        const dcmAnalyzeSpy = vi.spyOn(dcmParse, 'dcmAnalyze').mockReturnValue({
            success: true,
            filesWithIssues: [],
        });
        expect(() => {
            dartHookDcmAnalyzeCheck({ timeout: 60000 });
        }).toThrow('process.exit(0)');
        expect(dcmAnalyzeSpy).toHaveBeenCalledWith(expect.objectContaining({ timeout: 60000 }));
        dcmAnalyzeSpy.mockRestore();
    });
    it('should warn without blocking when dcm analyze times out', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['lib/main.dart']);
        const dcmAnalyzeSpy = vi.spyOn(dcmParse, 'dcmAnalyze').mockImplementation(() => {
            throw new dcmParse.DcmTimeoutError('/repo', 20000);
        });
        expect(() => {
            dartHookDcmAnalyzeCheck({});
        }).toThrow('process.exit(0)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('⚠️  DCM analyze timed out in /repo after 20000ms; skipping DCM analyze check.');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Raise the limit with --timeout <ms>.');
        dcmAnalyzeSpy.mockRestore();
    });
    it('should block with a message when dcm analyze fails to run', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['lib/main.dart']);
        const dcmAnalyzeSpy = vi.spyOn(dcmParse, 'dcmAnalyze').mockImplementation(() => {
            throw new Error('DCM analyze failed in /repo: boom');
        });
        expect(() => {
            dartHookDcmAnalyzeCheck({});
        }).toThrow('process.exit(1)');
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Push blocked: DCM analyze failed in /repo: boom');
        dcmAnalyzeSpy.mockRestore();
    });
    it('should run dcm analyze from the repo root when invoked from a subdirectory', () => {
        isGitRepoSpy.mockReturnValue(true);
        isDartPackageSpy.mockReturnValue(true);
        getAllChangedFilesSpy.mockReturnValue(['packages/app/lib/main.dart']);
        const getGitRootSpy = vi.spyOn(gitUtils, 'getGitRoot').mockReturnValue('/repo');
        const dcmAnalyzeSpy = vi.spyOn(dcmParse, 'dcmAnalyze').mockReturnValue({
            success: true,
            filesWithIssues: [],
        });
        expect(() => {
            dartHookDcmAnalyzeCheck({});
        }).toThrow('process.exit(0)');
        expect(dcmAnalyzeSpy).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/repo', files: ['packages/app/lib/main.dart'] }));
        dcmAnalyzeSpy.mockRestore();
        getGitRootSpy.mockRestore();
    });
});
