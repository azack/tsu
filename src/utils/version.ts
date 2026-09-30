import { execSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUpgradeCommand } from './build-upgrade-command.js';
import { packageManagerFromPaths } from './package-manager-from-paths.js';

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
 * Fetch the latest release's tag from GitHub, exactly as GitHub names it
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @returns The tag name (e.g. 'v0.29.0')
 */
async function getLatestGitHubTag(owner: string, repo: string): Promise<string> {
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
    return data.tag_name;
  } catch (error) {
    throw new Error(`Failed to fetch latest version from GitHub: ${error}`, {
      cause: error,
    });
  }
}

/**
 * Fetch the latest release version from GitHub
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @returns The latest version string (without 'v' prefix)
 */
export async function getLatestGitHubVersion(owner: string, repo: string): Promise<string> {
  return (await getLatestGitHubTag(owner, repo)).replace(/^v/, '');
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
 * @returns Object with update status, version information, and the latest release's tag
 */
export async function checkForUpdate(
  owner: string,
  repo: string
): Promise<{
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  latestTag: string;
}> {
  const currentVersion = getCurrentVersion();
  const latestTag = await getLatestGitHubTag(owner, repo);
  const latestVersion = latestTag.replace(/^v/, '');
  const comparison = compareVersions(currentVersion, latestVersion);

  return {
    updateAvailable: comparison < 0,
    currentVersion,
    latestVersion,
    latestTag,
  };
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
 * Upgrade tsu by installing from GitHub
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @param packageManager - Package manager to use (npm, pnpm, or yarn). If not provided, will try to detect, defaulting to pnpm.
 * @param tag - Release tag to install (e.g. 'v0.29.0'). npm needs it to install from the release tarball.
 * @throws Error if owner, repo, or tag contain invalid characters
 */
/* v8 ignore next -- @preserve */
export function upgradeFromGitHub(
  owner: string,
  repo: string,
  packageManager?: 'npm' | 'pnpm' | 'yarn',
  tag?: string
): void {
  // Auto-detect package manager if not specified, defaulting to pnpm
  const pm = packageManager || detectPackageManager() || 'pnpm';
  const command = buildUpgradeCommand(owner, repo, pm, tag);

  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to upgrade using ${pm}: ${error}`, { cause: error });
  }
}
