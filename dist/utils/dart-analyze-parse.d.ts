export interface DartAnalyzeIssue {
    severity: string;
    filePath: string;
    line: number;
    column: number;
    message: string;
    code: string;
}
export declare function parseDartAnalyzeOutput(output: string): DartAnalyzeIssue[];
export interface CallAndParseDartAnalyzeOptions {
    cwd: string;
    timeout?: number;
    files?: string[];
}
export interface CallAndParseDartAnalyzeResult {
    success: boolean;
    filesWithIssues: string[];
    issues: DartAnalyzeIssue[];
    rawOutput?: string;
}
export declare class DartAnalyzeTimeoutError extends Error {
    constructor(packageRoot: string, timeout: number);
}
export declare function dartAnalyze(options: CallAndParseDartAnalyzeOptions, dartAnalyzeRunner?: (packageRoot: string, timeout: number, files?: string[]) => string): CallAndParseDartAnalyzeResult;
