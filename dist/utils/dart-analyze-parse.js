import { execSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { findDartPackageRoot } from '../commands/dart/utils/dart.js';
import { escapeShellArg } from './shell.js';
export function parseDartAnalyzeOutput(output) {
    const issues = [];
    const issuePattern = /^\s*(info|warning|error)\s+[•-]\s+([^:]+):(\d+):(\d+)\s+[•-]\s+([^•-]+)\s+[•-]\s+(\S+)/gm;
    let match;
    while ((match = issuePattern.exec(output)) !== null) {
        const severity = match[1];
        const filePath = match[2];
        const line = match[3];
        const column = match[4];
        const message = match[5];
        const code = match[6];
        if (severity && filePath && line && column && message && code) {
            issues.push({
                severity: severity.trim(),
                filePath: filePath.trim(),
                line: parseInt(line, 10),
                column: parseInt(column, 10),
                message: message.trim(),
                code: code.trim(),
            });
        }
    }
    return issues;
}
function runDartAnalyzeForPackage(packageRoot, timeout, files) {
    const fileArgs = files && files.length > 0 ? files.map((f) => escapeShellArg(f)).join(' ') : '.';
    return execSync(`dart analyze ${fileArgs} --fatal-infos --fatal-warnings`, {
        cwd: packageRoot,
        stdio: 'pipe',
        timeout,
        encoding: 'utf-8',
    });
}
export class DartAnalyzeTimeoutError extends Error {
    constructor(packageRoot, timeout) {
        super(`dart analyze timed out in ${packageRoot} after ${timeout}ms`);
        this.name = 'DartAnalyzeTimeoutError';
    }
}
function processDartAnalyzeError(error, packageRoot, timeout) {
    const err = error;
    if (err.code === 'ETIMEDOUT') {
        throw new DartAnalyzeTimeoutError(packageRoot, timeout);
    }
    if (err.signal === 'SIGTERM') {
        throw new Error(`dart analyze timed out in ${packageRoot} after ${timeout}ms`);
    }
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    if (stdout.length > 0) {
        const issues = parseDartAnalyzeOutput(stdout);
        return {
            success: false,
            output: stdout,
            issues,
        };
    }
    const errorMsg = stderr.length > 0 ? stderr : 'No output from dart analyze';
    throw new Error(`dart analyze failed in ${packageRoot}: ${errorMsg}`);
}
export function dartAnalyze(options, dartAnalyzeRunner = runDartAnalyzeForPackage) {
    const { cwd, timeout = 20000, files } = options;
    const packageToFiles = new Map();
    if (files && files.length > 0) {
        for (const file of files) {
            const absolutePath = resolve(cwd, file);
            const packageRoot = findDartPackageRoot(dirname(absolutePath));
            if (packageRoot) {
                if (!packageToFiles.has(packageRoot)) {
                    packageToFiles.set(packageRoot, []);
                }
                const relativePath = relative(packageRoot, absolutePath);
                packageToFiles.get(packageRoot).push(relativePath);
            }
        }
    }
    if (packageToFiles.size === 0) {
        packageToFiles.set(cwd, []);
    }
    let allSuccess = true;
    const allIssues = [];
    let combinedOutput = '';
    for (const [packageRoot, packageFiles] of packageToFiles.entries()) {
        const filesToAnalyze = packageFiles.length > 0 ? packageFiles : undefined;
        try {
            const output = dartAnalyzeRunner(packageRoot, timeout, filesToAnalyze);
            combinedOutput += output;
        }
        catch (error) {
            const result = processDartAnalyzeError(error, packageRoot, timeout);
            allSuccess = false;
            combinedOutput += result.output;
            allIssues.push(...result.issues);
        }
    }
    const filesWithIssues = [...new Set(allIssues.map((issue) => issue.filePath))];
    return {
        success: allSuccess,
        filesWithIssues,
        issues: allIssues,
        rawOutput: combinedOutput,
    };
}
