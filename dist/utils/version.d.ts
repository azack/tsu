export declare function getCurrentVersion(): string;
export declare function getLatestGitHubVersion(owner: string, repo: string): Promise<string>;
export declare function compareVersions(current: string, latest: string): number;
export declare function checkForUpdate(owner: string, repo: string): Promise<{
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    latestTag: string;
}>;
export declare function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | null;
export declare function upgradeFromGitHub(owner: string, repo: string, packageManager?: 'npm' | 'pnpm' | 'yarn', tag?: string): void;
