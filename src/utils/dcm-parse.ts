import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { findDcmExcludedFiles } from './find-dcm-excluded-files.js';
import { splitJsonObjects } from './split-json-objects.js';
import { logIfVerbose } from './logger.js';
import { escapeShellArg } from './shell.js';

interface DcmAnalyzeResult {
  path: string;
  issues: Array<{
    id: string;
    location: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
      startOffset: number;
    };
    message: string;
    effortInMinutes: number;
    documentation: string;
    severity: string;
  }>;
}

interface DcmAnalyzeOutput {
  formatVersion: number;
  timestamp: string;
  summary: Array<{
    title: string;
    value: number;
  }>;
  analyzeResults: DcmAnalyzeResult[];
}

/**
 * Regular expression pattern for DCM version mismatch warnings.
 * Matches: "Installed DCM version (X.Y.Z) does not match the configured constraint A.B.C"
 * Allows for optional whitespace and trailing period.
 */
const DCM_VERSION_WARNING_PATTERN =
  /Installed\s+DCM\s+version\s+\([\d.]+\)\s+does\s+not\s+match\s+the\s+configured\s+constraint\s+[\d.]+\.?/;

/**
 * Detects if the output contains a DCM version mismatch warning.
 * The warning format is: "Installed DCM version (X.X.X) does not match the configured constraint Y.Y.Y"
 * @param output - The output to check
 * @returns true if a version warning is detected
 */
export function isDcmVersionWarning(output: string): boolean {
  return DCM_VERSION_WARNING_PATTERN.test(output);
}

/**
 * Checks if the output contains ONLY a DCM version mismatch warning (and success messages).
 * This is used to determine if an error should be ignored.
 * Success messages like "✔ no issues found!" or "✔ Analysis is completed" are also allowed.
 * @param output - The output to check
 * @returns true if the output contains only a version warning, success messages, and whitespace
 */
export function isOnlyDcmVersionWarning(output: string): boolean {
  if (!output || output.trim().length === 0) {
    return false;
  }

  // Must contain a version warning
  if (!isDcmVersionWarning(output)) {
    return false;
  }

  // Split into lines and check each non-empty line
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    // Allow version warning lines
    if (DCM_VERSION_WARNING_PATTERN.test(line)) {
      continue;
    }
    // Allow success/completion messages
    if (line.match(/^✔|^✓|Analysis is completed|no issues found|Preparing the results/)) {
      continue;
    }
    // Any other line means it's not just a version warning
    return false;
  }

  return true;
}

/**
 * Extracts and logs DCM version warnings from output if present.
 * Logs warnings only in verbose mode to avoid cluttering output.
 * @param output - The output to check for version warnings
 */
export function handleDcmVersionWarning(output: string): void {
  if (isDcmVersionWarning(output)) {
    const match = output.match(DCM_VERSION_WARNING_PATTERN);
    if (match) {
      logIfVerbose(undefined, `⚠️  DCM Warning: ${match[0]}`);
    }
  }
}

export function parseDcmAnalyzeOutput(jsonOutput: string): string[] {
  // DCM prints human-readable text, and with --print-config each package's config, before the report
  const report = splitJsonObjects(jsonOutput).find(isDcmAnalyzeOutput);
  return report ? report.analyzeResults.map((result) => result.path) : [];
}

function isDcmAnalyzeOutput(value: unknown): value is DcmAnalyzeOutput {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { analyzeResults?: unknown }).analyzeResults)
  );
}

export interface CallAndParseDcmOptions {
  cwd: string;
  timeout?: number;
  files?: string[];
}

export interface CallAndParseDcmResult {
  success: boolean;
  filesWithIssues: string[];
  rawOutput?: string;
}

/**
 * Thrown when DCM analyze does not finish within the timeout.
 * A timeout says nothing about the code, so callers can report it differently from a failure.
 */
export class DcmTimeoutError extends Error {
  constructor(cwd: string, timeout: number) {
    super(`DCM analyze timed out in ${cwd} after ${timeout}ms`);
    this.name = 'DcmTimeoutError';
  }
}

/**
 * Runs DCM analyze from cwd on the given files, or on the whole directory when none are given.
 * DCM applies each file's own package analysis_options.yaml rules, so one call covers files from
 * several packages without analyzing those packages in full. It skips that file's excludes,
 * though, so named files get `--print-config` and processDcmError applies the excludes itself.
 * Separated for easier testing and to avoid scattering v8 ignore comments.
 */
/* v8 ignore next -- @preserve */
function runDcm(cwd: string, timeout: number, files: string[]): string {
  const targets = files.length > 0 ? files.map((f) => escapeShellArg(f)).join(' ') : '.';
  const printConfig = files.length > 0 ? ' --print-config' : '';
  return execSync(
    `dcm analyze ${targets} --fatal-style --fatal-warnings --no-congratulate --reporter=json${printConfig}`,
    {
      cwd,
      stdio: 'pipe',
      timeout,
      encoding: 'utf-8',
    }
  );
}

interface DcmRunResult {
  success: boolean;
  output: string;
  filesWithIssues: string[];
}

/**
 * Processes error from DCM execution and extracts results.
 * Distinguishes between timeout/execution errors and DCM finding issues.
 * Handles version mismatch warnings gracefully by logging them in verbose mode only.
 */
function processDcmError(error: unknown, cwd: string, timeout: number): DcmRunResult {
  const err = error as {
    code?: string;
    signal?: string;
    stdout?: Buffer | string;
    stderr?: Buffer | string;
  };

  // Only execSync's own timeout sets ETIMEDOUT; a bare SIGTERM came from outside and must not pass the check
  if (err.code === 'ETIMEDOUT') {
    throw new DcmTimeoutError(cwd, timeout);
  }

  // If DCM ran but found issues, stdout will have the JSON report
  const stdout = err.stdout?.toString() || '';
  const stderr = err.stderr?.toString() || '';

  // Check for version warnings in stderr and log them in verbose mode
  handleDcmVersionWarning(stderr);
  handleDcmVersionWarning(stdout);

  if (stdout.length > 0) {
    // DCM found issues (exit code non-zero but produced JSON output)
    const filesWithIssues = parseDcmAnalyzeOutput(stdout);
    const excludedFiles = findDcmExcludedFiles(stdout, filesWithIssues, cwd);
    const reportableFiles = filesWithIssues.filter((file) => !excludedFiles.has(file));

    if (excludedFiles.size > 0) {
      logIfVerbose(
        undefined,
        `Ignoring DCM findings in ${excludedFiles.size} file(s) their package's analysis_options.yaml excludes: ${[...excludedFiles].join(', ')}`
      );
    }

    if (filesWithIssues.length > 0 && reportableFiles.length === 0) {
      return {
        success: true,
        output: stdout,
        filesWithIssues: [],
      };
    }

    // If there are no files with issues but stderr contains only version warning,
    // treat this as success
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
      filesWithIssues: reportableFiles,
    };
  }

  // Check if stderr contains ONLY a version warning (not a real error)
  if (stderr.length > 0 && isOnlyDcmVersionWarning(stderr)) {
    // Version warning only - not a failure
    return {
      success: true,
      output: stderr,
      filesWithIssues: [],
    };
  }

  // DCM failed to run properly - no output or real errors
  const errorMsg = stderr.length > 0 ? stderr : 'No output from DCM';
  throw new Error(`DCM analyze failed in ${cwd}: ${errorMsg}`);
}

export function dcmAnalyze(
  options: CallAndParseDcmOptions,
  // Allow dependency injection for testing
  dcmRunner: (cwd: string, timeout: number, files: string[]) => string = runDcm,
  fileExists: (path: string) => boolean = existsSync
): CallAndParseDcmResult {
  const { cwd, timeout = 7000, files } = options;

  // Deleted files show up in change lists but cannot be analyzed
  const existingFiles = (files ?? []).filter((file) => fileExists(resolve(cwd, file)));

  if (files && files.length > 0 && existingFiles.length === 0) {
    return { success: true, filesWithIssues: [], rawOutput: '' };
  }

  try {
    const output = dcmRunner(cwd, timeout, existingFiles);
    // Check for version warnings in successful runs too
    handleDcmVersionWarning(output);
    return { success: true, filesWithIssues: [], rawOutput: output };
  } catch (error: unknown) {
    const result = processDcmError(error, cwd, timeout);
    return {
      success: result.success,
      filesWithIssues: result.filesWithIssues,
      rawOutput: result.output,
    };
  }
}
