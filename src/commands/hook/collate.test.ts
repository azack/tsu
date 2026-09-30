import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hookCollate } from './collate.js';
import * as gitUtils from '../git/utils/git.js';
import * as dartUtils from '../dart/utils/dart.js';
import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';
import type { ChangedFileEntry } from '../git/utils/changed-files/changed-file-entry.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFile: vi.fn(),
}));

// Mock util - promisify should return a function that returns a promise
vi.mock('node:util', () => ({
  promisify: vi.fn((fn) => {
    return (...args: any[]) => {
      return new Promise((resolve, reject) => {
        fn(...args, (error?: any, stdout?: string, stderr?: string) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout: stdout || '', stderr: stderr || '' });
          }
        });
      });
    };
  }),
}));

// Mock git utilities. isCodeownersRelevant is intentionally NOT mocked so the
// real relevance logic runs against the entries each test supplies.
vi.mock('../git/utils/git.js', () => ({
  isGitRepo: vi.fn(),
  getAllChangedFilesWithStatus: vi.fn(),
}));

// isCodeownersRelevant is imported directly (not via the mocked barrel).
vi.mock('../git/utils/changed-files/is-codeowners-relevant.js', async (importOriginal) => {
  return await importOriginal();
});

// Mock dart utilities
vi.mock('../dart/utils/dart.js', () => ({
  isDartPackage: vi.fn(),
}));

/** Convenience for building a mocked execFile that calls back successfully. */
function successfulExecFile(track?: (args: string[]) => void) {
  return (
    _file: string,
    args: readonly string[] | null | undefined,
    _options: any,
    callback?: ((error: any, stdout: string, stderr: string) => void) | null
  ) => {
    if (track && args) {
      track([...(args as string[])]);
    }
    if (callback) {
      callback(null, '', '');
    }
    return {} as any;
  };
}

describe('hookCollate', () => {
  const mockExecFile = vi.mocked(execFile);
  const mockIsGitRepo = vi.mocked(gitUtils.isGitRepo);
  const mockIsDartPackage = vi.mocked(dartUtils.isDartPackage);
  const mockGetChangedFiles = vi.mocked(gitUtils.getAllChangedFilesWithStatus);

  const setChangedFiles = (entries: ChangedFileEntry[]) => {
    mockGetChangedFiles.mockReturnValue(entries);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGitRepo.mockReturnValue(true);
    mockIsDartPackage.mockReturnValue(true);
    mockGetChangedFiles.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should exit early and skip all checks when no files are changed', async () => {
    setChangedFiles([]);
    mockExecFile.mockImplementation(successfulExecFile());

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    // No relevant files and nothing added/renamed: codeowners must not be spawned.
    expect(mockExecFile).toHaveBeenCalledTimes(0);
    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });

  it('should exit early and skip codeowners when only existing files are modified', async () => {
    // The original complaint: yaml/config-only pushes should be fast.
    setChangedFiles([
      { path: 'pubspec.yaml', status: 'M' },
      { path: 'config/app.json', status: 'M' },
    ]);
    mockExecFile.mockImplementation(successfulExecFile());

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    expect(mockExecFile).toHaveBeenCalledTimes(0);
    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });

  it('should run codeowners when a non-dart file is added', async () => {
    setChangedFiles([{ path: 'assets/logo.png', status: 'A' }]);

    const calledCommands: string[] = [];
    mockExecFile.mockImplementation(
      successfulExecFile((args) => calledCommands.push(args.join(' ')))
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    expect(calledCommands.some((cmd) => cmd.includes('git codeowners check'))).toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });

  it('should run codeowners when an OWNERSHIP file is modified', async () => {
    setChangedFiles([{ path: 'lib/feature/OWNERSHIP', status: 'M' }]);

    const calledCommands: string[] = [];
    mockExecFile.mockImplementation(
      successfulExecFile((args) => calledCommands.push(args.join(' ')))
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    expect(calledCommands.some((cmd) => cmd.includes('git codeowners check'))).toBe(true);
    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });

  it('should run dart hooks but skip codeowners when only existing dart files are modified', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'M' }]);

    const calledCommands: string[] = [];
    mockExecFile.mockImplementation(
      successfulExecFile((args) => calledCommands.push(args.join(' ')))
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    // format, analysis, dcm run; codeowners skipped (modify can't change ownership).
    expect(calledCommands.some((cmd) => cmd.includes('git codeowners check'))).toBe(false);
    expect(mockExecFile).toHaveBeenCalledTimes(3);
    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });

  it('should exit with code 1 when not in a git repository', async () => {
    mockIsGitRepo.mockReturnValue(false);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(hookCollate({ verbose: false })).rejects.toThrow('process.exit called');

    expect(mockConsoleError).toHaveBeenCalledWith('Error: Not in a git repository');
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should exit with code 1 when not in a Dart package', async () => {
    mockIsDartPackage.mockReturnValue(false);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(hookCollate({ verbose: false })).rejects.toThrow('process.exit called');

    expect(mockConsoleError).toHaveBeenCalledWith('Error: Not in a Dart package');
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should run all hooks by default when Dart files are added', async () => {
    setChangedFiles([
      { path: 'lib/main.dart', status: 'A' },
      { path: 'lib/utils.dart', status: 'A' },
    ]);
    mockExecFile.mockImplementation(successfulExecFile());

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    // format, analysis, dcm analyze, codeowners (graphql skipped: no .graphql files)
    expect(mockExecFile).toHaveBeenCalledTimes(4);
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('should only run dart-format when specified', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'M' }]);
    mockExecFile.mockImplementation(successfulExecFile());

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ dartFormat: true, verbose: false });

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('should track and report failures when hooks fail', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'A' }]);

    let callCount = 0;
    mockExecFile.mockImplementation(
      (
        _file: string,
        _args: readonly string[] | null | undefined,
        _options: any,
        callback?: ((error: any, stdout: string, stderr: string) => void) | null
      ) => {
        callCount++;
        if (callback) {
          if (callCount === 1) {
            const error = new Error('Command failed') as Error & { code: number };
            error.code = 1;
            callback(error, '', '');
          } else {
            callback(null, '', '');
          }
        }
        return {} as any;
      }
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await hookCollate({ verbose: false });

    expect(mockConsoleError).toHaveBeenCalledWith('❌ One or more checks failed:');
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should extract and display file details from format check failures', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'M' }]);

    mockExecFile.mockImplementation(
      (
        _file: string,
        args: readonly string[] | null | undefined,
        _options: any,
        callback?: ((error: any, stdout: string, stderr: string) => void) | null
      ) => {
        const argsArray = args as string[];
        if (callback) {
          if (argsArray && argsArray.includes('format')) {
            const error = new Error('Command failed') as Error & {
              code: number;
              stderr: string;
            };
            error.code = 1;
            error.stderr = `
❌ Push blocked: Files were formatted. Please stage and commit these changes:
lib/widget.dart
lib/helper.dart
`;
            callback(error, '', error.stderr);
          } else {
            callback(null, '', '');
          }
        }
        return {} as any;
      }
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const errorCalls: string[] = [];
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation((msg: string) => {
      errorCalls.push(msg);
    });

    await hookCollate({ dartFormat: true, verbose: false });

    expect(errorCalls).toContain('  - dart format check');
    expect(errorCalls).toContain('    Files need formatting');
    expect(errorCalls).toContain('      lib/widget.dart');
    expect(errorCalls).toContain('      lib/helper.dart');
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should extract and display file details from analysis check failures', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'M' }]);

    mockExecFile.mockImplementation(
      (
        _file: string,
        args: readonly string[] | null | undefined,
        _options: any,
        callback?: ((error: any, stdout: string, stderr: string) => void) | null
      ) => {
        const argsArray = args as string[];
        if (callback) {
          if (argsArray && argsArray.includes('analysis')) {
            const error = new Error('Command failed') as Error & {
              code: number;
              stderr: string;
            };
            error.code = 1;
            error.stderr = `
❌ Push blocked: dart analyze found issues in the following file(s):
  lib/api.dart
  lib/model.dart

Run \`dart fix --apply\` to fix some issues automatically.
`;
            callback(error, '', error.stderr);
          } else {
            callback(null, '', '');
          }
        }
        return {} as any;
      }
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const errorCalls: string[] = [];
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation((msg: string) => {
      errorCalls.push(msg);
    });

    await hookCollate({ dartAnalysis: true, verbose: false });

    expect(errorCalls).toContain('  - dart analysis check');
    expect(errorCalls).toContain('    dart analyze found issues');
    expect(errorCalls).toContain('      lib/api.dart');
    expect(errorCalls).toContain('      lib/model.dart');
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should handle failures without parseable output gracefully', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'M' }]);

    mockExecFile.mockImplementation(
      (
        _file: string,
        args: readonly string[] | null | undefined,
        _options: any,
        callback?: ((error: any, stdout: string, stderr: string) => void) | null
      ) => {
        const argsArray = args as string[];
        if (callback) {
          if (argsArray && argsArray.includes('format')) {
            const error = new Error('Some unknown error') as Error & { code: number };
            error.code = 1;
            callback(error, '', 'Some unknown error');
          } else {
            callback(null, '', '');
          }
        }
        return {} as any;
      }
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const errorCalls: string[] = [];
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation((msg: string) => {
      errorCalls.push(msg);
    });

    await hookCollate({ dartFormat: true, verbose: false });

    expect(errorCalls).toContain('  - dart format check');
    expect(errorCalls.filter((c) => c.startsWith('    '))).toHaveLength(0);
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should run GraphQL check when .graphql files are added', async () => {
    setChangedFiles([{ path: 'schema/query.graphql', status: 'A' }]);
    mockExecFile.mockImplementation(successfulExecFile());

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    // graphql and codeowners (added file → codeowners relevant); dart hooks skipped
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it("should run checks with this process's Node binary and CLI build, not a tsu on PATH", async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'M' }]);

    const calls: { file: string; args: string[] }[] = [];
    mockExecFile.mockImplementation(
      (
        file: string,
        args: readonly string[] | null | undefined,
        _options: any,
        callback?: ((error: any, stdout: string, stderr: string) => void) | null
      ) => {
        calls.push({ file, args: [...((args as string[]) ?? [])] });
        if (callback) {
          callback(null, '', '');
        }
        return {} as any;
      }
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      const [cliPath = '', subcommand] = call.args;
      expect(call.file).toBe(process.execPath);
      expect(isAbsolute(cliPath)).toBe(true);
      expect(cliPath).toMatch(/[\\/]cli\.js$/);
      expect(subcommand).toBe('hook');
    }
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('should pass changed file options to hook commands', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'A' }]);

    const commandArgs: string[][] = [];
    mockExecFile.mockImplementation(successfulExecFile((args) => commandArgs.push(args)));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ staged: true, baseBranch: 'develop', verbose: true });

    const hookCalls = commandArgs.filter((args) => args.includes('hook'));

    hookCalls.forEach((args) => {
      expect(args).toContain('--staged');
      expect(args).toContain('--base-branch');
      expect(args).toContain('develop');
      expect(args).toContain('--verbose');
    });

    mockExit.mockRestore();
  });

  it('should run hooks concurrently, not sequentially', async () => {
    setChangedFiles([
      { path: 'lib/main.dart', status: 'A' },
      { path: 'schema/query.graphql', status: 'A' },
    ]);

    const executionOrder: string[] = [];

    mockExecFile.mockImplementation(
      (
        _file: string,
        args: readonly string[] | null | undefined,
        _options: any,
        callback?: ((error: any, stdout: string, stderr: string) => void) | null
      ) => {
        const argsArray = args as string[];
        const hookName =
          argsArray && argsArray.includes('format')
            ? 'format'
            : argsArray && argsArray.includes('analysis')
              ? 'analysis'
              : argsArray && argsArray.includes('dcm')
                ? 'dcm'
                : argsArray && argsArray.includes('codeowners')
                  ? 'codeowners'
                  : 'graphql';

        executionOrder.push(hookName);

        Promise.resolve().then(() => {
          if (callback) {
            callback(null, '', '');
          }
        });

        return {} as any;
      }
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    expect(executionOrder).toHaveLength(5);
    expect(executionOrder).toContain('format');
    expect(executionOrder).toContain('analysis');
    expect(executionOrder).toContain('dcm');
    expect(executionOrder).toContain('graphql');
    expect(executionOrder).toContain('codeowners');

    expect(mockExecFile).toHaveBeenCalledTimes(5);
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('should run codeowners check by default when Dart files are added', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'A' }]);

    const calledCommands: string[] = [];
    mockExecFile.mockImplementation(
      successfulExecFile((args) => calledCommands.push(args.join(' ')))
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ verbose: false });

    expect(calledCommands.some((cmd) => cmd.includes('git codeowners check'))).toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(4);
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('should skip codeowners check when explicitly disabled with other flags', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'A' }]);

    const calledCommands: string[] = [];
    mockExecFile.mockImplementation(
      successfulExecFile((args) => calledCommands.push(args.join(' ')))
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ dartFormat: true, verbose: false });

    expect(calledCommands.some((cmd) => cmd.includes('git codeowners check'))).toBe(false);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('should run codeowners when explicitly requested even without relevant changes', async () => {
    // Explicit --codeowners forces the check regardless of relevance gating.
    setChangedFiles([{ path: 'pubspec.yaml', status: 'M' }]);

    const calledCommands: string[] = [];
    mockExecFile.mockImplementation(
      successfulExecFile((args) => calledCommands.push(args.join(' ')))
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ codeowners: true, verbose: false });

    expect(calledCommands.some((cmd) => cmd.includes('git codeowners check'))).toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('should not pass changed file args to codeowners check', async () => {
    setChangedFiles([{ path: 'lib/main.dart', status: 'A' }]);

    const commandArgs: string[][] = [];
    mockExecFile.mockImplementation(successfulExecFile((args) => commandArgs.push(args)));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await hookCollate({ staged: true, baseBranch: 'develop', verbose: false });

    const codeownersArgs = commandArgs.find((args) => args.includes('codeowners'));

    expect(codeownersArgs).toBeDefined();
    expect(codeownersArgs).not.toContain('--staged');
    expect(codeownersArgs).not.toContain('--base-branch');
    expect(codeownersArgs).not.toContain('develop');

    mockExit.mockRestore();
  });
});
