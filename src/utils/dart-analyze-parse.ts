import { execSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { findDartPackageRoot } from '../commands/dart/utils/dart.js';
import { escapeShellArg } from './shell.js';

export interface DartAnalyzeIssue {
  severity: string;
  filePath: string;
  line: number;
  column: number;
  message: string;
  code: string;
}

export function parseDartAnalyzeOutput(output: string): DartAnalyzeIssue[] {
  const issues: DartAnalyzeIssue[] = [];

  // Match pattern: severity [•-] filepath:line:column [•-] message [•-] code
  // Supports both bullet (•) and dash (-) separators
  // Examples:
  //   info • lib/account/screens/account_screen/account_screen.dart:102:16 • Use 'const' with the constructor... • prefer_const_constructors
  //   error - lib/main.dart:1:8 - Target of URI doesn't exist... - uri_does_not_exist
  const issuePattern =
    /^\s*(info|warning|error)\s+[•-]\s+([^:]+):(\d+):(\d+)\s+[•-]\s+([^•-]+)\s+[•-]\s+(\S+)/gm;

  let match;
  while ((match = issuePattern.exec(output)) !== null) {
    // TypeScript regex match guarantees these exist due to the pattern
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
  /** Package roots whose dart analyze timed out while another package reported issues */
  timedOutPackageRoots?: string[];
}

/**
 * Runs dart analyze for a single package root with optional file list.
 * Separated for easier testing and to avoid scattering v8 ignore comments.
 */
/* v8 ignore next -- @preserve */
function runDartAnalyzeForPackage(packageRoot: string, timeout: number, files?: string[]): string {
  const fileArgs = files && files.length > 0 ? files.map((f) => escapeShellArg(f)).join(' ') : '.';

  return execSync(`dart analyze ${fileArgs} --fatal-infos --fatal-warnings`, {
    cwd: packageRoot,
    stdio: 'pipe',
    timeout,
    encoding: 'utf-8',
  });
}

/**
 * Thrown when dart analyze does not finish within the timeout.
 * A timeout says nothing about the code, so callers can report it differently from a failure.
 */
export class DartAnalyzeTimeoutError extends Error {
  constructor(packageRoot: string, timeout: number) {
    super(`dart analyze timed out in ${packageRoot} after ${timeout}ms`);
    this.name = 'DartAnalyzeTimeoutError';
  }
}

interface DartAnalyzeRunResult {
  success: boolean;
  output: string;
  issues: DartAnalyzeIssue[];
}

/**
 * Processes error from dart analyze execution and extracts results.
 * Distinguishes between timeout/execution errors and dart analyze finding issues.
 */
function processDartAnalyzeError(
  error: unknown,
  packageRoot: string,
  timeout: number
): DartAnalyzeRunResult {
  const err = error as {
    code?: string;
    signal?: string;
    stdout?: Buffer | string;
    stderr?: Buffer | string;
  };

  // Only execSync's own timeout sets ETIMEDOUT; a bare SIGTERM came from outside and must not pass the check
  if (err.code === 'ETIMEDOUT') {
    throw new DartAnalyzeTimeoutError(packageRoot, timeout);
  }
  if (err.signal === 'SIGTERM') {
    throw new Error(`dart analyze timed out in ${packageRoot} after ${timeout}ms`);
  }

  // If dart analyze ran but found issues, stdout will have the report
  const stdout = err.stdout?.toString() || '';
  const stderr = err.stderr?.toString() || '';

  if (stdout.length > 0) {
    // dart analyze found issues (exit code non-zero but produced output)
    const issues = parseDartAnalyzeOutput(stdout);
    return {
      success: false,
      output: stdout,
      issues,
    };
  }

  // dart analyze failed to run properly - no output
  const errorMsg = stderr.length > 0 ? stderr : 'No output from dart analyze';
  throw new Error(`dart analyze failed in ${packageRoot}: ${errorMsg}`);
}

export function dartAnalyze(
  options: CallAndParseDartAnalyzeOptions,
  // Allow dependency injection for testing
  dartAnalyzeRunner: (
    packageRoot: string,
    timeout: number,
    files?: string[]
  ) => string = runDartAnalyzeForPackage
): CallAndParseDartAnalyzeResult {
  const { cwd, timeout = 20000, files } = options;

  // Group files by their package roots
  const packageToFiles = new Map<string, string[]>();

  if (files && files.length > 0) {
    for (const file of files) {
      const absolutePath = resolve(cwd, file);
      const packageRoot = findDartPackageRoot(dirname(absolutePath));
      if (packageRoot) {
        if (!packageToFiles.has(packageRoot)) {
          packageToFiles.set(packageRoot, []);
        }
        // Convert to relative path from package root
        const relativePath = relative(packageRoot, absolutePath);
        packageToFiles.get(packageRoot)!.push(relativePath);
      }
    }
  }

  if (packageToFiles.size === 0) {
    // No files provided or no package roots found, use cwd with no specific files
    packageToFiles.set(cwd, []);
  }

  // Run dart analyze on each package with its associated files
  let allSuccess = true;
  const allIssues: DartAnalyzeIssue[] = [];
  let combinedOutput = '';
  const timedOutPackageRoots: string[] = [];

  for (const [packageRoot, packageFiles] of packageToFiles.entries()) {
    const filesToAnalyze = packageFiles.length > 0 ? packageFiles : undefined;

    try {
      const output = dartAnalyzeRunner(packageRoot, timeout, filesToAnalyze);
      combinedOutput += output;
    } catch (error: unknown) {
      let result: DartAnalyzeRunResult;
      try {
        result = processDartAnalyzeError(error, packageRoot, timeout);
      } catch (processError: unknown) {
        // Keep analyzing the other packages, so a timeout can't hide issues they report
        if (processError instanceof DartAnalyzeTimeoutError) {
          timedOutPackageRoots.push(packageRoot);
          continue;
        }
        throw processError;
      }
      allSuccess = false;
      combinedOutput += result.output;
      allIssues.push(...result.issues);
    }
  }

  if (allSuccess && timedOutPackageRoots.length > 0) {
    throw new DartAnalyzeTimeoutError(timedOutPackageRoots.join(', '), timeout);
  }

  // Extract unique file paths with issues
  const filesWithIssues = [...new Set(allIssues.map((issue) => issue.filePath))];

  return {
    success: allSuccess,
    filesWithIssues,
    issues: allIssues,
    rawOutput: combinedOutput,
    ...(timedOutPackageRoots.length > 0 ? { timedOutPackageRoots } : {}),
  };
}
