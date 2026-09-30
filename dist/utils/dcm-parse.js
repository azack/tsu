import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { logIfVerbose } from './logger.js';
import { escapeShellArg } from './shell.js';
const DCM_VERSION_WARNING_PATTERN = /Installed\s+DCM\s+version\s+\([\d.]+\)\s+does\s+not\s+match\s+the\s+configured\s+constraint\s+[\d.]+\.?/;
export function isDcmVersionWarning(output) {
    return DCM_VERSION_WARNING_PATTERN.test(output);
}
export function isOnlyDcmVersionWarning(output) {
    if (!output || output.trim().length === 0) {
        return false;
    }
    if (!isDcmVersionWarning(output)) {
        return false;
    }
    const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    for (const line of lines) {
        if (DCM_VERSION_WARNING_PATTERN.test(line)) {
            continue;
        }
        if (line.match(/^✔|^✓|Analysis is completed|no issues found|Preparing the results/)) {
            continue;
        }
        return false;
    }
    return true;
}
export function handleDcmVersionWarning(output) {
    if (isDcmVersionWarning(output)) {
        const match = output.match(DCM_VERSION_WARNING_PATTERN);
        if (match) {
            logIfVerbose(undefined, `⚠️  DCM Warning: ${match[0]}`);
        }
    }
}
export function parseDcmAnalyzeOutput(jsonOutput) {
    try {
        const jsonMatch = jsonOutput.match(/\{.*\}/s);
        if (!jsonMatch) {
            return [];
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.analyzeResults.map((result) => result.path);
    }
    catch {
        return [];
    }
}
export class DcmTimeoutError extends Error {
    constructor(cwd, timeout) {
        super(`DCM analyze timed out in ${cwd} after ${timeout}ms`);
        this.name = 'DcmTimeoutError';
    }
}
function runDcm(cwd, timeout, files) {
    const targets = files.length > 0 ? files.map((f) => escapeShellArg(f)).join(' ') : '.';
    return execSync(`dcm analyze ${targets} --fatal-style --fatal-warnings --no-congratulate --reporter=json`, {
        cwd,
        stdio: 'pipe',
        timeout,
        encoding: 'utf-8',
    });
}
function processDcmError(error, cwd, timeout) {
    const err = error;
    if (err.code === 'ETIMEDOUT') {
        throw new DcmTimeoutError(cwd, timeout);
    }
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    handleDcmVersionWarning(stderr);
    handleDcmVersionWarning(stdout);
    if (stdout.length > 0) {
        const filesWithIssues = parseDcmAnalyzeOutput(stdout);
        if (filesWithIssues.length === 0 && isOnlyDcmVersionWarning(stderr)) {
            return {
                success: true,
                output: stdout + stderr,
                filesWithIssues: [],
            };
        }
        return {
            success: false,
            output: stdout,
            filesWithIssues,
        };
    }
    if (stderr.length > 0 && isOnlyDcmVersionWarning(stderr)) {
        return {
            success: true,
            output: stderr,
            filesWithIssues: [],
        };
    }
    const errorMsg = stderr.length > 0 ? stderr : 'No output from DCM';
    throw new Error(`DCM analyze failed in ${cwd}: ${errorMsg}`);
}
export function dcmAnalyze(options, dcmRunner = runDcm, fileExists = existsSync) {
    const { cwd, timeout = 7000, files } = options;
    const existingFiles = (files ?? []).filter((file) => fileExists(resolve(cwd, file)));
    if (files && files.length > 0 && existingFiles.length === 0) {
        return { success: true, filesWithIssues: [], rawOutput: '' };
    }
    try {
        const output = dcmRunner(cwd, timeout, existingFiles);
        handleDcmVersionWarning(output);
        return { success: true, filesWithIssues: [], rawOutput: output };
    }
    catch (error) {
        const result = processDcmError(error, cwd, timeout);
        return {
            success: result.success,
            filesWithIssues: result.filesWithIssues,
            rawOutput: result.output,
        };
    }
}
