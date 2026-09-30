import { execSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
export async function getLatestGitHubVersion(owner, repo) {
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
        return data.tag_name.replace(/^v/, '');
    }
    catch (error) {
        throw new Error(`Failed to fetch latest version from GitHub: ${error}`, {
            cause: error,
        });
    }
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
    const latestVersion = await getLatestGitHubVersion(owner, repo);
    const comparison = compareVersions(currentVersion, latestVersion);
    return {
        updateAvailable: comparison < 0,
        currentVersion,
        latestVersion,
    };
}
export function packageManagerFromPaths(paths) {
    const matches = (needles) => paths.some((path) => needles.some((needle) => path.includes(needle)));
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
function isValidGitHubName(name) {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
}
export function buildUpgradeCommand(owner, repo, packageManager, version) {
    if (!isValidGitHubName(owner)) {
        throw new Error(`Invalid GitHub owner: "${owner}". Must be alphanumeric with hyphens/underscores.`);
    }
    if (!isValidGitHubName(repo)) {
        throw new Error(`Invalid GitHub repo: "${repo}". Must be alphanumeric with hyphens/underscores.`);
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
export function upgradeFromGitHub(owner, repo, packageManager, version) {
    const pm = packageManager || detectPackageManager() || 'pnpm';
    const command = buildUpgradeCommand(owner, repo, pm, version);
    try {
        execSync(command, { stdio: 'inherit' });
    }
    catch (error) {
        throw new Error(`Failed to upgrade using ${pm}: ${error}`, { cause: error });
    }
}
export function getTsuOnPath() {
    let path = null;
    let version = null;
    try {
        path = execSync('which tsu', { encoding: 'utf-8', stdio: 'pipe' }).trim() || null;
    }
    catch {
    }
    try {
        version = execSync('tsu --version', { encoding: 'utf-8', stdio: 'pipe' }).trim() || null;
    }
    catch {
    }
    return { path, version };
}
