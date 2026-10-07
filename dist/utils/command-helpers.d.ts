import type { ChangedFilesOptions } from '../types/command-options.js';
export declare function ensureCondition(condition: boolean, errorMessage: string, options?: {
    verbose?: boolean;
    successMessage?: string;
    exitCode?: number;
    command?: string;
}): void;
export declare function ensureDartInstalled(verbose?: boolean): void;
export declare function ensurePackagesResolved(files: string[], cwd: string, repoRoot: string, checkName: string): void;
export declare function ensureDCMInstalled(verbose?: boolean): void;
export declare function ensureClaudeInstalled(): void;
export interface DisplayChangedFilesOptions extends ChangedFilesOptions {
    filter?: (file: string) => boolean;
    typePrefix?: string;
}
export declare function displayChangedFiles(options: DisplayChangedFilesOptions): void;
export declare function getChangedFilesWithOptions(options: DisplayChangedFilesOptions): string[];
export interface DisplayFileListOptions {
    files: string[];
    verbose?: boolean;
    message?: string;
}
export declare function displayFileList(options: DisplayFileListOptions): void;
