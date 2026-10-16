import { describe, it, expect, vi, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { GIT_REPOSITORY_ENV_VARS, withoutGitRepositoryEnv } from './without-git-repository-env.js';
import { dartAnalyze } from './dart-analyze-parse.js';
import { dcmAnalyze } from './dcm-parse.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('withoutGitRepositoryEnv', () => {
  it('should drop every repository-local git variable', () => {
    const env = Object.fromEntries(GIT_REPOSITORY_ENV_VARS.map((key) => [key, 'value']));

    expect(withoutGitRepositoryEnv(env)).toEqual({});
  });

  it('should keep variables git does not scope to a repository', () => {
    const env = {
      GIT_DIR: '/repo/.git/worktrees/feature',
      GIT_EXEC_PATH: '/usr/libexec/git-core',
      PATH: '/usr/bin',
      FLUTTER_ROOT: '/sdk/flutter',
    };

    expect(withoutGitRepositoryEnv(env)).toEqual({
      GIT_EXEC_PATH: '/usr/libexec/git-core',
      PATH: '/usr/bin',
      FLUTTER_ROOT: '/sdk/flutter',
    });
  });

  it('should not modify the environment it is given', () => {
    const env = { GIT_DIR: '/repo/.git', PATH: '/usr/bin' };

    withoutGitRepositoryEnv(env);

    expect(env).toEqual({ GIT_DIR: '/repo/.git', PATH: '/usr/bin' });
  });

  it('should default to process.env', () => {
    vi.stubEnv('GIT_DIR', '/repo/.git/worktrees/feature');

    const env = withoutGitRepositoryEnv();

    expect(env.GIT_DIR).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH);
  });
});

describe('Dart tool runners', () => {
  it('should run dart analyze without the git repository variables', () => {
    vi.stubEnv('GIT_DIR', '/repo/.git/worktrees/feature');

    dartAnalyze({ cwd: '/repo/package' });

    const [command, options] = vi.mocked(execSync).mock.calls[0] ?? [];
    expect(String(command)).toMatch(/^dart analyze /);
    expect(options?.env).toBeDefined();
    expect(options?.env?.GIT_DIR).toBeUndefined();
  });

  it('should run dcm analyze without the git repository variables', () => {
    vi.stubEnv('GIT_DIR', '/repo/.git/worktrees/feature');

    dcmAnalyze({ cwd: '/repo' });

    const [command, options] = vi.mocked(execSync).mock.calls[0] ?? [];
    expect(String(command)).toMatch(/^dcm analyze /);
    expect(options?.env).toBeDefined();
    expect(options?.env?.GIT_DIR).toBeUndefined();
  });
});
