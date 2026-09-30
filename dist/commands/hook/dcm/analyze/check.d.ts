import type { ChangedFilesOptions } from '../../../../types/command-options.js';
export interface DartHookDcmAnalyzeCheckOptions extends ChangedFilesOptions {
    excludeSuffixes?: string[];
    timeout?: number;
}
export declare const DEFAULT_HOOK_DCM_TIMEOUT_MS = 20000;
export declare function dartHookDcmAnalyzeCheck(options?: DartHookDcmAnalyzeCheckOptions): void;
