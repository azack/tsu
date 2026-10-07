import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dartHookAnalysisCheck } from './check.js';
import * as gitUtils from '../../git/utils/git.js';
import * as dartUtils from '../../dart/utils/dart.js';
import * as shellUtils from '../../../utils/shell.js';
import * as dartAnalyzeParse from '../../../utils/dart-analyze-parse.js';
import { resetVerbose } from '../../../utils/verbose-state.js';

describe('dartHookAnalysisCheck', () => {
  let consoleErrorSpy: any;
  let processExitSpy: any;
  let isGitRepoSpy: any;
  let isDartPackageSpy: any;
  let getAllChangedFilesSpy: any;
  let isCommandInstalledSpy: any;

  beforeEach(() => {
    // Reset verbose state before each test
    resetVerbose();

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    isGitRepoSpy = vi.spyOn(gitUtils, 'isGitRepo');
    isDartPackageSpy = vi.spyOn(dartUtils, 'isDartPackage');
    getAllChangedFilesSpy = vi.spyOn(gitUtils, 'getAllChangedFiles');
    isCommandInstalledSpy = vi.spyOn(shellUtils, 'isCommandInstalled');

    // Default: Dart is installed
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
      dartHookAnalysisCheck({ verbose: false });
    }).toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a git repository');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with error if not in a Dart package', () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(false);

    expect(() => {
      dartHookAnalysisCheck({ verbose: false });
    }).toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a Dart package');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with success if no Dart source files modified', () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue([]);

    expect(() => {
      dartHookAnalysisCheck({ verbose: true });
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
      dartHookAnalysisCheck({ verbose: true });
    }).toThrow('process.exit(0)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('✓ No Dart source files modified');
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('should use provided files when files option is given', () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue([]);

    expect(() => {
      dartHookAnalysisCheck({ verbose: true });
    }).toThrow('process.exit(0)');

    expect(getAllChangedFilesSpy).toHaveBeenCalled();
  });

  it('should run dart analyze on dart files and exit with success when no issues', () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/main.dart', 'lib/models/user.dart']);

    const dartAnalyzeSpy = vi.spyOn(dartAnalyzeParse, 'dartAnalyze').mockReturnValue({
      success: true,
      filesWithIssues: [],
      issues: [],
      rawOutput: 'No issues found!',
    });

    expect(() => {
      dartHookAnalysisCheck({ verbose: true });
    }).toThrow('process.exit(0)');

    expect(dartAnalyzeSpy).toHaveBeenCalledWith({
      cwd: expect.any(String),
      timeout: 20000,
      files: ['lib/main.dart', 'lib/models/user.dart'],
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('✓ All files pass dart analyze');

    dartAnalyzeSpy.mockRestore();
  });

  it('should display file list in verbose mode when analyzing files', () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/main.dart']);

    const dartAnalyzeSpy = vi.spyOn(dartAnalyzeParse, 'dartAnalyze').mockReturnValue({
      success: true,
      filesWithIssues: [],
      issues: [],
      rawOutput: 'No issues found!',
    });

    expect(() => {
      dartHookAnalysisCheck({ verbose: true });
    }).toThrow('process.exit(0)');

    // Should display the file list
    expect(consoleErrorSpy).toHaveBeenCalledWith('Running dart analyze on 1 file(s):');
    expect(consoleErrorSpy).toHaveBeenCalledWith('  lib/main.dart');

    dartAnalyzeSpy.mockRestore();
  });

  it('should block without running dart analyze when a package is unresolved', () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['features/lib/main.dart']);

    const getGitRootSpy = vi.spyOn(gitUtils, 'getGitRoot').mockReturnValue('/repo');
    const unresolvedSpy = vi
      .spyOn(dartUtils, 'findUnresolvedPackageRoots')
      .mockReturnValue(['/repo/features']);
    const dartAnalyzeSpy = vi.spyOn(dartAnalyzeParse, 'dartAnalyze');

    expect(() => {
      dartHookAnalysisCheck({});
    }).toThrow('process.exit(1)');

    expect(unresolvedSpy).toHaveBeenCalledWith(['features/lib/main.dart'], '/repo', '/repo');
    expect(dartAnalyzeSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('  features');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Run `flutter pub get` (or `dart pub get`), then push again.'
    );

    getGitRootSpy.mockRestore();
    unresolvedSpy.mockRestore();
    dartAnalyzeSpy.mockRestore();
  });

  it('should exit with error when dart analyze finds issues', () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/main.dart', 'lib/models/user.dart']);

    const dartAnalyzeSpy = vi.spyOn(dartAnalyzeParse, 'dartAnalyze').mockReturnValue({
      success: false,
      filesWithIssues: ['lib/main.dart'],
      issues: [
        {
          severity: 'error',
          filePath: 'lib/main.dart',
          line: 10,
          column: 5,
          message: 'Some error',
          code: 'error_code',
        },
      ],
      rawOutput: 'error - lib/main.dart:10:5 - Some error - error_code',
    });

    expect(() => {
      dartHookAnalysisCheck({ verbose: true });
    }).toThrow('process.exit(1)');

    expect(dartAnalyzeSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Push blocked: dart analyze found issues in the following file(s):'
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('  lib/main.dart');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Run `dart fix --apply` to fix some issues automatically.'
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);

    dartAnalyzeSpy.mockRestore();
  });
});
