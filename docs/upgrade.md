# Upgrade Command

Self-upgrade tsu to the latest version from the GitHub repository.

## upgrade

Upgrades tsu from GitHub to the latest version. This command first checks if an update is available, then uses your specified package manager to install the latest version from GitHub.

**Usage:**

```bash
tsu upgrade [options]
```

**Options:**

- `-v, --verbose` - Show progress messages (output to stderr)
- `-p, --package-manager <manager>` - Package manager to use: npm, pnpm, or yarn (default: detected from where the installed `tsu` lives, else pnpm)

**Exit codes:**

- `0` - Successfully upgraded or already on latest version
- `1` - Failed to upgrade or error occurred, including when the install finished but the `tsu` on `PATH` still reports an older version (for example, another install shadows it)

**Output:**

In `--verbose` mode, displays progress messages to stderr:

When already up-to-date:

```
🔍 Checking for updates...
✓ Already on the latest version (0.6.0)
```

When upgrading:

```
🔍 Checking for updates...
📦 Current version: 0.6.0
✨ Latest version: 0.7.0
📥 Upgrading using npm...
[npm output...]
✓ Successfully upgraded to version 0.7.0
```

**Examples:**

Upgrade using default package manager (npm):

```bash
tsu upgrade --verbose
```

Upgrade using pnpm:

```bash
tsu upgrade --package-manager pnpm --verbose
```

Upgrade using yarn:

```bash
tsu upgrade --package-manager yarn --verbose
```

Check for updates first, then upgrade:

```bash
tsu check version --verbose && tsu upgrade --verbose
```

Automatic upgrade in script:

```bash
#!/bin/bash
# Ensure we're on the latest version
if tsu check version | grep -q "update_available: true"; then
  echo "Upgrading tsu..."
  tsu upgrade --package-manager pnpm --verbose
fi
```

**Notes:**

- The upgrade command uses the same package manager syntax as the initial installation
- pnpm and yarn install from `github:bestdan/tsu`, which gets the latest code from the main branch. npm installs the latest release's tarball instead, because `npm install -g github:bestdan/tsu` leaves a broken symlink into npm's temporary clone directory
- After installing, it runs `tsu --version` and fails if the `tsu` on `PATH` doesn't report the new version
- Requires appropriate permissions to install global packages
- If the upgrade fails, you can manually reinstall:
  ```bash
  npm install -g https://codeload.github.com/bestdan/tsu/tar.gz/refs/tags/v<version>
  # or
  pnpm add -g github:bestdan/tsu
  # or
  yarn global add github:bestdan/tsu
  ```

## Related Commands

- [`check version`](./check.md#check-version) - Check if tsu is on the most recent version
- [`check externals`](./check.md#check-externals) - Check if external dependencies are installed
