import { execSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUpgradeCommand } from './build-upgrade-command.js';
import { packageManagerFromPaths } from './package-manager-from-paths.js';
export function getCurrentVersion() {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const packageJsonPath = join(__dirname, '..', '..', 'package.json');
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        return packageJson.version;
    }
    catch {
        throw new Error('Failed to read current version from package.json');
    }
}
async function getLatestGitHubTag(owner, repo) {
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
        const data = (await response.json());
        return data.tag_name;
    }
    catch (error) {
        throw new Error(`Failed to fetch latest version from GitHub: ${error}`, {
            cause: error,
        });
    }
}
export async function getLatestGitHubVersion(owner, repo) {
    return (await getLatestGitHubTag(owner, repo)).replace(/^v/, '');
}
export function compareVersions(current, latest) {
    const parseCurrent = current.split('.').map(Number);
    const parseLatest = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(parseCurrent.length, parseLatest.length); i++) {
        const c = parseCurrent[i] || 0;
        const l = parseLatest[i] || 0;
        if (c < l)
            return -1;
        if (c > l)
            return 1;
    }
    return 0;
}
export async function checkForUpdate(owner, repo) {
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
export function detectPackageManager() {
    try {
        const whichTsu = execSync('which tsu', { encoding: 'utf-8' }).trim();
        const paths = [whichTsu];
        try {
            paths.push(realpathSync(whichTsu));
        }
        catch {
        }
        return packageManagerFromPaths(paths);
    }
    catch {
        return null;
    }
}
export function upgradeFromGitHub(owner, repo, packageManager, tag) {
    const pm = packageManager || detectPackageManager() || 'pnpm';
    const command = buildUpgradeCommand(owner, repo, pm, tag);
    try {
        execSync(command, { stdio: 'inherit' });
    }
    catch (error) {
        throw new Error(`Failed to upgrade using ${pm}: ${error}`, { cause: error });
    }
}
