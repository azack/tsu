import { execSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Get the current installed version of tsu from package.json
 * @returns The current version string
 */
export function getCurrentVersion(): string {
  try {
    // In ESM, __dirname is not available, so we need to construct it
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Go up from src/utils to the root directory
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    throw new Error('Failed to read current version from package.json');
  }
}

/**
 * Fetch the latest release version from GitHub
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @returns The latest version string (without 'v' prefix)
 */
export async function getLatestGitHubVersion(owner: string, repo: string): Promise<string> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'tsu-cli',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { tag_name: string };
    // Remove 'v' prefix if present
    return data.tag_name.replace(/^v/, '');
  } catch (error) {
    throw new Error(`Failed to fetch latest version from GitHub: ${error}`, {
      cause: error,
    });
  }
}

/**
 * Compare two semver version strings
 * @param current - Current version string
 * @param latest - Latest version string
 * @returns -1 if current < latest, 0 if equal, 1 if current > latest
 */
export function compareVersions(current: string, latest: string): number {
  const parseCurrent = current.split('.').map(Number);
  const parseLatest = latest.split('.').map(Number);

  for (let i = 0; i < Math.max(parseCurrent.length, parseLatest.length); i++) {
    const c = parseCurrent[i] || 0;
    const l = parseLatest[i] || 0;

    if (c < l) return -1;
    if (c > l) return 1;
  }

  return 0;
}

/**
 * Check if an update is available
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @returns Object with update status and version information
 */
export async function checkForUpdate(
  owner: string,
  repo: string
): Promise<{
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
}> {
  const currentVersion = getCurrentVersion();
  const latestVersion = await getLatestGitHubVersion(owner, repo);
  const comparison = compareVersions(currentVersion, latestVersion);

  return {
    updateAvailable: comparison < 0,
    currentVersion,
    latestVersion,
  };
}

/**
 * Infers the package manager that owns a global `tsu` from its paths.
 * @param paths - The `tsu` path on PATH and, when it's a symlink, its resolved target.
 *   npm's global bin (e.g. `/usr/local/bin/tsu`) only reveals npm once resolved into
 *   `lib/node_modules`, while yarn's `~/.yarn/bin` link resolves into `~/.config/yarn`.
 * @returns The package manager, or null if no path matches
 */
export function packageManagerFromPaths(paths: string[]): 'npm' | 'pnpm' | 'yarn' | null {
  const matches = (needles: string[]) =>
    paths.some((path) => needles.some((needle) => path.includes(needle)));

  if (matches(['/Library/pnpm/', '/.local/share/pnpm/'])) {
    return 'pnpm';
  }
  if (matches(['/.yarn/', '/Yarn/', '/.config/yarn/'])) {
    return 'yarn';
  }
  if (matches(['/lib/node_modules/', '/.npm/'])) {
    return 'npm';
  }
  return null;
}

/**
 * Detect which package manager was used to install tsu globally
 * @returns The detected package manager or null if not found
 */
/* v8 ignore next -- @preserve */
export function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | null {
  try {
    // Check which package manager has tsu installed
    const whichTsu = execSync('which tsu', { encoding: 'utf-8' }).trim();
    const paths = [whichTsu];
    try {
      paths.push(realpathSync(whichTsu));
    } catch {
      // Dangling symlink: fall back to the unresolved path
    }
    return packageManagerFromPaths(paths);
  } catch {
    return null;
  }
}

/**
 * Validates a GitHub owner or repo name.
 * GitHub names can contain alphanumeric characters, hyphens, and underscores.
 * They cannot start with a hyphen or contain shell metacharacters.
 */
/* v8 ignore next -- @preserve */
function isValidGitHubName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
}

/**
 * Builds the global install command for a package manager.
 *
 * When a version is given, every package manager installs that release's tag, so
 * they all install the same code. npm installs the tag's tarball rather than a
 * `github:` spec, because `npm install -g github:<owner>/<repo>` leaves the global
 * package as a symlink into npm's temporary git-clone directory (no working bin), and
 * the next install fails with ENOTDIR.
 *
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @param packageManager - Package manager to use
 * @param version - Release version to install (e.g. '0.29.0'), without the `v` prefix
 * @returns The shell command to run
 * @throws Error if owner, repo, or version contain invalid characters
 */
export function buildUpgradeCommand(
  owner: string,
  repo: string,
  packageManager: 'npm' | 'pnpm' | 'yarn',
  version?: string
): string {
  // Validate inputs to prevent command injection
  if (!isValidGitHubName(owner)) {
    throw new Error(
      `Invalid GitHub owner: "${owner}". Must be alphanumeric with hyphens/underscores.`
    );
  }
  if (!isValidGitHubName(repo)) {
    throw new Error(
      `Invalid GitHub repo: "${repo}". Must be alphanumeric with hyphens/underscores.`
    );
  }
  if (version !== undefined && !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version: "${version}". Must be in X.Y.Z format.`);
  }

  const githubUrl = `github:${owner}/${repo}`;
  const githubSpec = version ? `${githubUrl}#v${version}` : githubUrl;

  switch (packageManager) {
    case 'pnpm':
      return `pnpm add -g ${githubSpec}`;
    case 'yarn':
      return `yarn global add ${githubSpec}`;
    case 'npm':
    default:
      return version
        ? `npm install -g https://codeload.github.com/${owner}/${repo}/tar.gz/refs/tags/v${version}`
        : `npm install -g ${githubUrl}`;
  }
}

/**
 * Upgrade tsu by installing from GitHub
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @param packageManager - Package manager to use (npm, pnpm, or yarn). If not provided, will try to detect, defaulting to pnpm.
 * @param version - Release version to install. npm needs it to install from the release tarball.
 * @throws Error if owner, repo, or version contain invalid characters
 */
/* v8 ignore next -- @preserve */
export function upgradeFromGitHub(
  owner: string,
  repo: string,
  packageManager?: 'npm' | 'pnpm' | 'yarn',
  version?: string
): void {
  // Auto-detect package manager if not specified, defaulting to pnpm
  const pm = packageManager || detectPackageManager() || 'pnpm';
  const command = buildUpgradeCommand(owner, repo, pm, version);

  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to upgrade using ${pm}: ${error}`, { cause: error });
  }
}

/**
 * Reports which `tsu` is first on this process's PATH and the version it prints.
 * @returns The resolved path and version, each null if it couldn't be determined
 */
/* v8 ignore next -- @preserve */
export function getTsuOnPath(): { path: string | null; version: string | null } {
  let path: string | null = null;
  let version: string | null = null;
  try {
    path = execSync('which tsu', { encoding: 'utf-8', stdio: 'pipe' }).trim() || null;
  } catch {
    // tsu not on PATH
  }
  try {
    version = execSync('tsu --version', { encoding: 'utf-8', stdio: 'pipe' }).trim() || null;
  } catch {
    // tsu not runnable
  }
  return { path, version };
}
