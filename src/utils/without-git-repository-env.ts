/**
 * The repository-local variables git lists in `git rev-parse --local-env-vars`.
 * Git exports some of them to hooks, `GIT_DIR` among them when the hook runs in a linked worktree.
 */
export const GIT_REPOSITORY_ENV_VARS: readonly string[] = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
];

/**
 * Returns a copy of `env` without the variables in {@link GIT_REPOSITORY_ENV_VARS}, for running
 * Dart, Flutter, DCM or melos from a hook. Those tools run git against their own SDK checkout,
 * and Flutter's `bin/internal/shared.sh` doesn't unset `GIT_DIR`, so from a worktree hook it reads
 * this repository's HEAD as the SDK's, rebuilds its tool and records a bogus Flutter version.
 * The tools find the repository from their working directory without them.
 */
export function withoutGitRepositoryEnv(
  env: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !GIT_REPOSITORY_ENV_VARS.includes(key))
  );
}
