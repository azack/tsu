import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dartHookGraphqlCheck } from './check.js';
import * as gitUtils from '../../git/utils/git.js';
import * as dartUtils from '../../dart/utils/dart.js';
import * as shellUtils from '../../../utils/shell.js';
import { execSync } from 'node:child_process';
import { resetVerbose } from '../../../utils/verbose-state.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('dartHookGraphqlCheck', () => {
  let consoleErrorSpy: any;
  let processExitSpy: any;
  let isGitRepoSpy: any;
  let isDartPackageSpy: any;
  let getAllChangedFilesSpy: any;
  let isCommandInstalledSpy: any;
  let getGitStatusSpy: any;

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
    getGitStatusSpy = vi.spyOn(gitUtils, 'getGitStatus');

    // Mock execSync to succeed by default
    vi.mocked(execSync).mockReturnValue('' as any);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    isGitRepoSpy.mockRestore();
    isDartPackageSpy.mockRestore();
    getAllChangedFilesSpy.mockRestore();
    isCommandInstalledSpy.mockRestore();
    getGitStatusSpy.mockRestore();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('should exit with error if not in a git repository', async () => {
    isGitRepoSpy.mockReturnValue(false);

    await expect(async () => {
      await dartHookGraphqlCheck({ verbose: false });
    }).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a git repository');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with error if not in a Dart package', async () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(false);

    await expect(async () => {
      await dartHookGraphqlCheck({ verbose: false });
    }).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Not in a Dart package');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with success if no GraphQL files modified', async () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/user.dart', 'lib/main.dart']);

    await expect(async () => {
      await dartHookGraphqlCheck({ verbose: true });
    }).rejects.toThrow('process.exit(0)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('✓ No GraphQL files modified (skipping)');
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('should use provided files when files option is given', async () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue([]);

    await expect(async () => {
      await dartHookGraphqlCheck({ verbose: true });
    }).rejects.toThrow('process.exit(0)');

    expect(getAllChangedFilesSpy).toHaveBeenCalled();
  });

  it('should display file list in verbose mode when running graphql codegen', async () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/query.graphql']);
    isCommandInstalledSpy.mockReturnValue(true);
    getGitStatusSpy.mockReturnValue('M  lib/query.graphql');

    await expect(async () => {
      await dartHookGraphqlCheck({ verbose: true });
    }).rejects.toThrow('process.exit(0)');

    // Should display the file list
    expect(consoleErrorSpy).toHaveBeenCalledWith('Running GraphQL codegen on 1 file(s):');
    expect(consoleErrorSpy).toHaveBeenCalledWith('  lib/query.graphql');
  });

  it('should exit early if melos is not installed', async () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/query.graphql']);
    isCommandInstalledSpy.mockReturnValue(false);

    await expect(async () => {
      await dartHookGraphqlCheck({ verbose: true });
    }).rejects.toThrow('process.exit(0)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('⚠️  Warning: Melos not installed, skipping');
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('should exit early if melos is not installed (non-verbose)', async () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/query.graphql']);
    isCommandInstalledSpy.mockReturnValue(false);

    await expect(async () => {
      await dartHookGraphqlCheck({ verbose: false });
    }).rejects.toThrow('process.exit(0)');

    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('should run codegen without the git repository variables a worktree hook exports', async () => {
    vi.stubEnv('GIT_DIR', '/repo/.git/worktrees/feature');
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/query.graphql']);
    isCommandInstalledSpy.mockReturnValue(true);
    getGitStatusSpy.mockReturnValue('');

    await expect(dartHookGraphqlCheck({ verbose: false })).rejects.toThrow('process.exit(0)');

    const melosCalls = vi
      .mocked(execSync)
      .mock.calls.filter(([command]) => String(command).startsWith('melos '));
    expect(melosCalls.map(([command]) => command)).toEqual([
      'melos run codegen:graphql',
      'melos run codegen:graphql:test',
    ]);
    for (const [, options] of melosCalls) {
      expect(options?.env).toBeDefined();
      expect(options?.env?.GIT_DIR).toBeUndefined();
      expect(options?.env?.PATH).toBe(process.env.PATH);
    }
  });

  it('should exit with success if no GraphQL files modified (non-verbose)', async () => {
    isGitRepoSpy.mockReturnValue(true);
    isDartPackageSpy.mockReturnValue(true);
    getAllChangedFilesSpy.mockReturnValue(['lib/user.dart', 'lib/main.dart']);

    await expect(async () => {
      await dartHookGraphqlCheck({ verbose: false });
    }).rejects.toThrow('process.exit(0)');

    expect(processExitSpy).toHaveBeenCalledWith(0);
  });
});
