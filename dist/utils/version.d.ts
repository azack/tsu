export declare function getCurrentVersion(): string;
export declare function getLatestGitHubVersion(owner: string, repo: string): Promise<string>;
export declare function compareVersions(current: string, latest: string): number;
export declare function checkForUpdate(owner: string, repo: string): Promise<{
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
}>;
export declare function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | null;
export declare function buildUpgradeCommand(owner: string, repo: string, packageManager: 'npm' | 'pnpm' | 'yarn', version?: string): string;
export declare function upgradeFromGitHub(owner: string, repo: string, packageManager?: 'npm' | 'pnpm' | 'yarn', version?: string): void;
export declare function getTsuOnPath(): {
    path: string | null;
    version: string | null;
};
