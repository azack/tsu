import type { ChangedFilesOptions } from '../../../types/command-options.js';
export interface DartHookAnalysisCheckOptions extends ChangedFilesOptions {
    excludeSuffixes?: string[];
    timeout?: number;
}
export declare const DEFAULT_HOOK_ANALYSIS_TIMEOUT_MS = 20000;
export declare function dartHookAnalysisCheck(options?: DartHookAnalysisCheckOptions): void;
