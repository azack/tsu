import {
  checkForUpdate,
  upgradeFromGitHub,
  detectPackageManager,
  getTsuOnPath,
} from '../utils/version.js';
import { logIfVerbose } from '../utils/logger.js';

export interface UpgradeOptions {
  verbose?: boolean;
  packageManager?: 'npm' | 'pnpm' | 'yarn';
}

const GITHUB_OWNER = 'bestdan';
const GITHUB_REPO = 'tsu';

/**
 * Upgrade tsu from GitHub to the latest version.
 * First checks if an update is available, then uses the specified package manager
 * to install from GitHub.
 * In verbose mode, outputs progress messages to stderr.
 * Exit code: 0 if successful, 1 if already up-to-date or error
 */
/* v8 ignore next -- @preserve */
export async function upgrade(options: UpgradeOptions = {}): Promise<void> {
  const verbose = options.verbose || false;
  const packageManager = options.packageManager || detectPackageManager() || 'pnpm';

  logIfVerbose(verbose, '🔍 Checking for updates...');

  try {
    const { updateAvailable, currentVersion, latestVersion } = await checkForUpdate(
      GITHUB_OWNER,
      GITHUB_REPO
    );

    if (!updateAvailable) {
      logIfVerbose(verbose, `✓ Already on the latest version (${currentVersion})`);
      process.exit(0);
    }

    logIfVerbose(verbose, `📦 Current version: ${currentVersion}`);
    logIfVerbose(verbose, `✨ Latest version: ${latestVersion}`);
    logIfVerbose(verbose, `📥 Upgrading using ${packageManager}...`);

    upgradeFromGitHub(GITHUB_OWNER, GITHUB_REPO, packageManager, latestVersion);

    const onPath = getTsuOnPath();
    if (onPath.version !== latestVersion) {
      console.error(
        `❌ Installed ${latestVersion} with ${packageManager}, but the tsu on PATH (${onPath.path ?? 'not found'}) reports ${onPath.version ?? 'no version'}.`
      );
      console.error('   Another install may be shadowing it. Check `which -a tsu`.');
      process.exit(1);
    }

    logIfVerbose(verbose, `✓ Successfully upgraded to version ${latestVersion}`);
    process.exit(0);
  } catch (error) {
    // Rethrow if this is a process.exit error from mocking
    if (error instanceof Error && error.message.startsWith('process.exit(')) {
      throw error;
    }
    if (verbose) {
      console.error(`❌ Failed to upgrade: ${error}`);
    }
    process.exit(1);
  }
}
