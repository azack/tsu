# Hook Commands

Git / Claude hook utilities for Dart/Flutter projects.

**Requirements:**
- All hook commands must be run in a git repository
- Dart-specific hooks (`format`, `analysis`, `fix`, `dcm`, `graphql`) must be run in a Dart package

The `tsu hook` commands run Dart, Flutter, DCM and melos without the repository variables git exports to hooks (`GIT_DIR` and the rest of `git rev-parse --local-env-vars`). From a linked worktree, `GIT_DIR` otherwise makes Flutter read this repository's HEAD as its own, rebuild its tool and report a bogus Flutter version, which fails `pub get`. A hook that runs those tools itself should clear the variables first, as the `fix` actions in `templates/hk.pkl` do.

## Available Commands

```bash
tsu hook format check        # Format Dart files about to be pushed (for git hooks)
tsu hook analysis check      # Run dart analyze on Dart files about to be pushed
tsu hook fix check           # Run dart fix on Dart files about to be pushed
tsu hook dcm fix check       # Run DCM fix on Dart files about to be pushed (for git hooks)
tsu hook dcm analyze check   # Run DCM analyze on Dart files about to be pushed
tsu hook graphql check       # Check GraphQL codegen is up to date (for git hooks)
```

## File Filtering Options

By default, all hook commands check **files that would be pushed** (commits on your branch that haven't been pushed yet). You can override this with:

- `--staged` - Check only staged files
- `--unstaged` - Check only unstaged files
- `--all` - Check all changes (committed + staged + unstaged)
- `--base-branch <branch>` - Compare against a custom base branch (default: `main`)

If your local base branch is behind `origin/<branch>` (common with worktrees, where local `main` is rarely updated), hooks compare against whichever of `<branch>` and `origin/<branch>` your branch forked from more recently, so files from commits already merged upstream aren't re-checked. You don't need to run `git fetch origin main:main` first.

**Examples:**
```bash
# Check files to be pushed (default)
tsu hook format check

# Check only staged files
tsu hook format check --staged

# Check all changes including unstaged
tsu hook format check --all

# Compare against develop branch instead of main
tsu hook format check --base-branch develop
```

## Command Details

### `hook format check`

Formats Dart files about to be pushed (excluding generated files) and exits with error if changes were made. Perfect for pre-push hooks.

**How it works:**
1. Gets Dart files about to be pushed (or based on `--staged`, `--unstaged`, `--all` options)
2. Filters out generated files (files ending with common codegen suffixes)
3. Runs `dart format` on those files
4. Checks if formatting created any changes
5. Exits with error (non-zero) if changes were made
6. Exits successfully if no changes were needed

**Requirements**: 
- Must be run in a git repository
- Must be run in a Dart package
- Dart SDK must be installed. Get it from https://dart.dev

**Example usage in git hooks:**
```bash
# In .git/hooks/pre-push or lefthook.yml
tsu hook format check || exit 1
```

### `hook analysis check`

Runs dart analyze on Dart files about to be pushed (excluding generated files) and exits with error if issues are found. Perfect for pre-push hooks.

**How it works:**
1. Gets Dart files about to be pushed (or based on `--staged`, `--unstaged`, `--all` options)
2. Filters out generated files
3. Maps files to their package roots
4. Runs `dart analyze` on each unique package
5. Exits with error if dart analyze reports any issues

**Requirements**: 
- Must be run in a git repository
- Must be run in a Dart package
- Dart SDK must be installed. Get it from https://dart.dev

**Example usage in git hooks:**
```bash
# In .git/hooks/pre-push or lefthook.yml
tsu hook analysis check || exit 1
```

### `hook fix check`

Runs dart fix on Dart files about to be pushed (excluding generated files) and exits with error if fixes were applied. Perfect for pre-push hooks.

**How it works:**
1. Gets Dart files about to be pushed (or based on `--staged`, `--unstaged`, `--all` options)
2. Filters out generated files
3. Runs `dart fix --apply` on each file individually
4. Checks if fixes created any changes
5. Exits with error (non-zero) if changes were made
6. Exits successfully if no changes were needed

**Requirements**: 
- Must be run in a git repository
- Must be run in a Dart package
- Dart SDK must be installed. Get it from https://dart.dev

**Example usage in git hooks:**
```bash
# In .git/hooks/pre-push or lefthook.yml
tsu hook fix check || exit 1
```

### `hook dcm fix check`

Runs DCM fix on Dart files about to be pushed (excluding generated files) and exits with error if fixes were applied. Perfect for pre-push hooks. Skips gracefully if DCM is not installed.

**How it works:**
1. Checks if DCM is installed, skips if not
2. Gets Dart files about to be pushed (or based on `--staged`, `--unstaged`, `--all` options)
3. Filters out generated files
4. Runs `dcm fix` on those files
5. Checks if DCM made any changes
6. Exits with error (non-zero) if changes were made
7. Exits successfully if no changes were needed

**Requirements**: 
- Must be run in a git repository
- Must be run in a Dart package
- DCM is optional. Install from https://dcm.dev

**Example usage in git hooks:**
```bash
# In .git/hooks/pre-push or lefthook.yml
tsu hook dcm fix check || exit 1
```

### `hook dcm analyze check`

Runs DCM analyze on Dart files about to be pushed (excluding generated files) and exits with error if issues are found. Perfect for pre-push hooks. Skips gracefully if DCM is not installed.

**How it works:**
1. Checks if DCM is installed, skips if not
2. Gets Dart files about to be pushed (or based on `--staged`, `--unstaged`, `--all` options)
3. Filters out generated files
4. Runs one `dcm analyze <files…>` from the current directory, which applies each file's own package `analysis_options.yaml` without analyzing whole packages
5. Exits with error if DCM analyze reports any issues or fails to run

If DCM does not finish within `--timeout <ms>` (default 20000), the check prints a warning and exits 0: a timeout says nothing about the code, so it does not block the push.

**Requirements**: 
- Must be run in a git repository
- Must be run in a Dart package
- DCM is optional. Install from https://dcm.dev

**Example usage in git hooks:**
```bash
# In .git/hooks/pre-push or lefthook.yml
tsu hook dcm analyze check || exit 1
```

### `hook graphql check`

Checks if GraphQL files have been modified and runs code generation (`melos run codegen:graphql` and `melos run codegen:graphql:test`) to ensure fakes are up to date. Exits with error if code generation creates changes. Perfect for pre-push hooks. Skips gracefully if melos is not installed.

**How it works:**
1. Checks if Melos is installed, skips if not
2. Gets files about to be pushed (or based on `--staged`, `--unstaged`, `--all` options)
3. Checks if any GraphQL files (`.graphql`) are in that set
4. If modified, runs GraphQL code generation commands
5. Checks if code generation created any changes
6. Exits with error (non-zero) if changes were made
7. Exits successfully if no changes were needed or no GraphQL files modified

**Requirements**: 
- Must be run in a git repository
- Must be run in a Dart package
- Melos is optional. Install from https://melos.invertase.dev

**Example usage in git hooks:**
```bash
# In .git/hooks/pre-push or lefthook.yml
tsu hook graphql check || exit 1
```

## Verbose Mode

All commands support the `--verbose` flag to show human-readable headers/messages to stderr (won't interfere with piping).
