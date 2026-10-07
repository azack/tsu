import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDcmAnalyzeOutput,
  dcmAnalyze,
  isDcmVersionWarning,
  isOnlyDcmVersionWarning,
  handleDcmVersionWarning,
  DcmTimeoutError,
} from './dcm-parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('parseDcmAnalyzeOutput', () => {
  it('should extract file paths from valid DCM analyze output', () => {
    const json = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [
        { title: 'Total lint style issues', value: 3 },
        { title: 'Scanned folders', value: 1046 },
        { title: 'Scanned files', value: 2069 },
      ],
      analyzeResults: [
        {
          path: 'lib/financial_security/screens/components/header.dart',
          issues: [
            {
              id: 'member-ordering',
              location: {
                endColumn: 22,
                endLine: 55,
                startColumn: 3,
                startLine: 55,
                startOffset: 2303,
              },
              message: 'final-nullable-fields should be before constructors.',
              effortInMinutes: 5,
              documentation: 'https://dcm.dev/docs/rules/common/member-ordering',
              severity: 'style',
            },
          ],
        },
        {
          path: 'lib/another/file.dart',
          issues: [],
        },
      ],
    });

    const result = parseDcmAnalyzeOutput(json);
    expect(result).toEqual([
      'lib/financial_security/screens/components/header.dart',
      'lib/another/file.dart',
    ]);
  });

  it('should return empty array for empty analyzeResults', () => {
    const json = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [],
      analyzeResults: [],
    });

    const result = parseDcmAnalyzeOutput(json);
    expect(result).toEqual([]);
  });

  it('should return empty array for invalid JSON', () => {
    const result = parseDcmAnalyzeOutput('not valid json');
    expect(result).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    const result = parseDcmAnalyzeOutput('');
    expect(result).toEqual([]);
  });

  it('should handle multiple files with issues', () => {
    const json = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [],
      analyzeResults: [
        { path: 'file1.dart', issues: [{}] },
        { path: 'file2.dart', issues: [{}] },
        { path: 'file3.dart', issues: [] },
      ],
    });

    const result = parseDcmAnalyzeOutput(json);
    expect(result).toEqual(['file1.dart', 'file2.dart', 'file3.dart']);
  });

  it('should extract JSON from mixed output with human-readable text', () => {
    // DCM outputs human-readable text before JSON
    const mixedOutput = `✖ total lint style issues - 3
{"formatVersion":11,"timestamp":"2025-11-04 15:18:34.000","summary":[{"title":"Total lint style issues","value":3}],"analyzeResults":[{"path":"lib/config.dart","issues":[{"id":"prefer-trailing-comma"}]}]}`;

    const result = parseDcmAnalyzeOutput(mixedOutput);
    expect(result).toEqual(['lib/config.dart']);
  });

  it('should handle multiline mixed output', () => {
    const mixedOutput = `Some warning text
Another line
{"formatVersion":11,"timestamp":"2025-11-04 15:18:34.000","summary":[],"analyzeResults":[{"path":"lib/file1.dart","issues":[]},{"path":"lib/file2.dart","issues":[]}]}
Trailing text`;

    const result = parseDcmAnalyzeOutput(mixedOutput);
    expect(result).toEqual(['lib/file1.dart', 'lib/file2.dart']);
  });

  it('should parse actual DCM error output from fixture', () => {
    const fixtureContent = readFileSync(
      join(__dirname, '../__fixtures__/dcm-analyze-output.json'),
      'utf-8'
    );

    const result = parseDcmAnalyzeOutput(fixtureContent);
    expect(result).toEqual(['lib/config.dart']);
  });

  it('should return empty array when JSON.parse throws', () => {
    // This has a valid JSON structure but will fail to parse as expected type
    const invalidStructure = '{"wrong": "structure"}';
    const result = parseDcmAnalyzeOutput(invalidStructure);
    expect(result).toEqual([]);
  });
});

describe('dcmAnalyze', () => {
  it('has correct interface and types', () => {
    expect(typeof dcmAnalyze).toBe('function');
  });

  it('should return success when DCM finds no issues', () => {
    const mockOutput = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [],
      analyzeResults: [],
    });

    const mockRunner = () => mockOutput;

    const result = dcmAnalyze({ cwd: '/test' }, mockRunner);

    expect(result.success).toBe(true);
    expect(result.filesWithIssues).toEqual([]);
    expect(result.rawOutput).toBe(mockOutput);
  });

  it('should handle DCM finding issues (non-zero exit but with JSON output)', () => {
    const mockOutput = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [],
      analyzeResults: [
        { path: 'lib/file1.dart', issues: [{}] },
        { path: 'lib/file2.dart', issues: [] },
      ],
    });

    const mockRunner = () => {
      const error: any = new Error('DCM found issues');
      error.stdout = mockOutput;
      error.stderr = '';
      throw error;
    };

    const result = dcmAnalyze({ cwd: '/test' }, mockRunner);

    expect(result.success).toBe(false);
    expect(result.filesWithIssues).toEqual(['lib/file1.dart', 'lib/file2.dart']);
    expect(result.rawOutput).toBe(mockOutput);
  });

  it('should throw error on timeout', () => {
    const mockRunner = () => {
      const error: any = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    };

    expect(() => dcmAnalyze({ cwd: '/test/pkg' }, mockRunner)).toThrow(
      'DCM analyze timed out in /test/pkg after 7000ms'
    );
  });

  it('should treat an external SIGTERM as a failure, not a timeout', () => {
    const mockRunner = () => {
      const error: any = new Error('Terminated');
      error.signal = 'SIGTERM';
      error.stdout = '';
      error.stderr = '';
      throw error;
    };

    expect(() => dcmAnalyze({ cwd: '/test/pkg' }, mockRunner)).toThrow(
      'DCM analyze failed in /test/pkg: No output from DCM'
    );
  });

  it('should throw error when DCM fails with no output', () => {
    const mockRunner = () => {
      const error: any = new Error('DCM failed');
      error.stdout = '';
      error.stderr = 'Command not found';
      throw error;
    };

    expect(() => dcmAnalyze({ cwd: '/test/pkg' }, mockRunner)).toThrow(
      'DCM analyze failed in /test/pkg: Command not found'
    );
  });

  it('should throw error when DCM fails with no stderr', () => {
    const mockRunner = () => {
      const error: any = new Error('DCM failed');
      error.stdout = '';
      error.stderr = '';
      throw error;
    };

    expect(() => dcmAnalyze({ cwd: '/test/pkg' }, mockRunner)).toThrow(
      'DCM analyze failed in /test/pkg: No output from DCM'
    );
  });

  it('should analyze cwd when no files provided', () => {
    const mockOutput = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [],
      analyzeResults: [],
    });

    let calledWith: string | undefined;
    const mockRunner = (runCwd: string) => {
      calledWith = runCwd;
      return mockOutput;
    };

    dcmAnalyze({ cwd: '/test/package' }, mockRunner);

    expect(calledWith).toBe('/test/package');
  });

  it('should use cwd when empty files array provided', () => {
    const mockOutput = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [],
      analyzeResults: [],
    });

    let calledWith: string | undefined;
    const mockRunner = (runCwd: string) => {
      calledWith = runCwd;
      return mockOutput;
    };

    dcmAnalyze({ cwd: '/test/package', files: [] }, mockRunner);

    expect(calledWith).toBe('/test/package');
  });

  it('should pass changed files to a single DCM run from cwd', () => {
    const mockOutput = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [],
      analyzeResults: [],
    });

    const calls: Array<{ cwd: string; files: string[] }> = [];
    const mockRunner = (cwd: string, _timeout: number, files: string[]) => {
      calls.push({ cwd, files });
      return mockOutput;
    };

    const result = dcmAnalyze(
      {
        cwd: '/test/workspace',
        files: ['script/tool.dart', 'packages/app/lib/main.dart', 'packages/core/lib/config.dart'],
      },
      mockRunner,
      () => true
    );

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      {
        cwd: '/test/workspace',
        files: ['script/tool.dart', 'packages/app/lib/main.dart', 'packages/core/lib/config.dart'],
      },
    ]);
  });

  it('should skip files that no longer exist', () => {
    let calledFiles: string[] | undefined;
    const mockRunner = (_cwd: string, _timeout: number, files: string[]) => {
      calledFiles = files;
      return '';
    };

    dcmAnalyze(
      { cwd: '/test/workspace', files: ['lib/kept.dart', 'lib/deleted.dart'] },
      mockRunner,
      (path) => path === '/test/workspace/lib/kept.dart'
    );

    expect(calledFiles).toEqual(['lib/kept.dart']);
  });

  it('should succeed without running DCM when every file was deleted', () => {
    let called = false;
    const mockRunner = () => {
      called = true;
      return '';
    };

    const result = dcmAnalyze(
      { cwd: '/test/workspace', files: ['lib/deleted.dart'] },
      mockRunner,
      () => false
    );

    expect(called).toBe(false);
    expect(result).toEqual({ success: true, filesWithIssues: [], rawOutput: '' });
  });

  it('should throw DcmTimeoutError on timeout', () => {
    const mockRunner = () => {
      const error: any = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    };

    expect(() => dcmAnalyze({ cwd: '/test/pkg', timeout: 1234 }, mockRunner)).toThrow(
      DcmTimeoutError
    );
  });
});

describe('isDcmVersionWarning', () => {
  it('should detect DCM version mismatch warning', () => {
    const warning =
      'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3';
    expect(isDcmVersionWarning(warning)).toBe(true);
  });

  it('should detect version warning with different versions', () => {
    const warning = 'Installed DCM version (2.0.0) does not match the configured constraint 1.99.9';
    expect(isDcmVersionWarning(warning)).toBe(true);
  });

  it('should detect version warning with complex version numbers', () => {
    const warning =
      'Installed DCM version (1.2.3) does not match the configured constraint 10.20.30';
    expect(isDcmVersionWarning(warning)).toBe(true);
  });

  it('should return false for non-warning output', () => {
    expect(isDcmVersionWarning('No issues found')).toBe(false);
    expect(isDcmVersionWarning('Error: Command not found')).toBe(false);
    expect(isDcmVersionWarning('')).toBe(false);
  });

  it('should return false for JSON output', () => {
    const json = JSON.stringify({
      formatVersion: 11,
      timestamp: '2025-11-04 14:46:10.000',
      summary: [],
      analyzeResults: [],
    });
    expect(isDcmVersionWarning(json)).toBe(false);
  });
});

describe('isOnlyDcmVersionWarning', () => {
  it('should return true when output contains only version warning', () => {
    const warning =
      'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3';
    expect(isOnlyDcmVersionWarning(warning)).toBe(true);
  });

  it('should return true when output contains version warning with period at end', () => {
    const warning =
      'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3.';
    expect(isOnlyDcmVersionWarning(warning)).toBe(true);
  });

  it('should return true when output contains version warning with whitespace', () => {
    const warning =
      '  Installed DCM version (1.34.0) does not match the configured constraint 1.33.3  \n';
    expect(isOnlyDcmVersionWarning(warning)).toBe(true);
  });

  it('should return false when output contains version warning mixed with error text', () => {
    const mixed =
      'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3\nError: Command failed';
    expect(isOnlyDcmVersionWarning(mixed)).toBe(false);
  });

  it('should return true when output contains version warning with success messages', () => {
    const mixed =
      '✔ Analysis is completed. Preparing the results: 2.3s\n✔ no issues found!\nInstalled DCM version (1.34.0) does not match the configured constraint 1.35.0';
    expect(isOnlyDcmVersionWarning(mixed)).toBe(true);
  });

  it('should return true when output contains version warning with checkmark messages', () => {
    const mixed =
      '✓ no issues found!\nInstalled DCM version (1.34.0) does not match the configured constraint 1.33.3';
    expect(isOnlyDcmVersionWarning(mixed)).toBe(true);
  });

  it('should return false for empty output', () => {
    expect(isOnlyDcmVersionWarning('')).toBe(false);
    expect(isOnlyDcmVersionWarning('   ')).toBe(false);
  });

  it('should return false for non-warning output', () => {
    expect(isOnlyDcmVersionWarning('Error: Command not found')).toBe(false);
  });
});

describe('handleDcmVersionWarning', () => {
  it('should be a function', () => {
    expect(typeof handleDcmVersionWarning).toBe('function');
  });

  it('should not throw on non-warning output', () => {
    expect(() => handleDcmVersionWarning('No issues found')).not.toThrow();
    expect(() => handleDcmVersionWarning('')).not.toThrow();
  });

  it('should not throw on version warning output', () => {
    const warning =
      'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3';
    expect(() => handleDcmVersionWarning(warning)).not.toThrow();
  });
});

describe('dcmAnalyze with version warnings', () => {
  it('should succeed when DCM returns version warning in stderr only', () => {
    const mockRunner = () => {
      const error: any = new Error('Version warning');
      error.stdout = '';
      error.stderr =
        'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3';
      throw error;
    };

    const result = dcmAnalyze({ cwd: '/test' }, mockRunner);

    expect(result.success).toBe(true);
    expect(result.filesWithIssues).toEqual([]);
  });

  it('should fail when stderr contains version warning mixed with other errors', () => {
    const mockRunner = () => {
      const error: any = new Error('Real error with warning');
      error.stdout = '';
      error.stderr =
        'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3\nError: Command failed to execute';
      throw error;
    };

    expect(() => dcmAnalyze({ cwd: '/test/pkg' }, mockRunner)).toThrow(
      'DCM analyze failed in /test/pkg'
    );
  });

  it('should succeed when version warning is mixed with successful JSON output', () => {
    const mockOutput =
      'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3\n' +
      JSON.stringify({
        formatVersion: 11,
        timestamp: '2025-11-04 14:46:10.000',
        summary: [],
        analyzeResults: [],
      });

    const mockRunner = () => mockOutput;

    const result = dcmAnalyze({ cwd: '/test' }, mockRunner);

    expect(result.success).toBe(true);
    expect(result.filesWithIssues).toEqual([]);
  });

  it('should fail when version warning is mixed with actual issues', () => {
    const mockOutput =
      'Installed DCM version (1.34.0) does not match the configured constraint 1.33.3\n' +
      JSON.stringify({
        formatVersion: 11,
        timestamp: '2025-11-04 14:46:10.000',
        summary: [],
        analyzeResults: [{ path: 'lib/file.dart', issues: [{}] }],
      });

    const mockRunner = () => {
      const error: any = new Error('Issues found');
      error.stdout = mockOutput;
      error.stderr = '';
      throw error;
    };

    const result = dcmAnalyze({ cwd: '/test' }, mockRunner);

    expect(result.success).toBe(false);
    expect(result.filesWithIssues).toEqual(['lib/file.dart']);
  });

  it('should succeed when JSON shows no issues and stderr has only version warning', () => {
    const mockStdout = JSON.stringify({
      formatVersion: 12,
      timestamp: '2025-12-16 09:09:58.000',
      summary: [
        { title: 'Scanned folders', value: 1 },
        { title: 'Scanned files', value: 1 },
      ],
      analyzeResults: [],
    });
    const mockStderr =
      'Installed DCM version (1.34.0) does not match the configured constraint 1.35.0';

    const mockRunner = () => {
      const error: any = new Error('Non-zero exit');
      error.stdout = mockStdout;
      error.stderr = mockStderr;
      throw error;
    };

    const result = dcmAnalyze({ cwd: '/test' }, mockRunner);

    expect(result.success).toBe(true);
    expect(result.filesWithIssues).toEqual([]);
  });
});

describe('dcmAnalyze with package excludes', () => {
  const printedConfig = (packageRoot: string, globalExcludes: string[]): string =>
    `⚙️ Merged config:\n${JSON.stringify(
      {
        'analysis-options-path': `${packageRoot}/analysis_options.yaml`,
        'global-excludes': globalExcludes,
      },
      null,
      2
    )}\n`;
  const report = (paths: string[]): string =>
    JSON.stringify({
      formatVersion: 13,
      summary: [],
      analyzeResults: paths.map((path) => ({ path, issues: [{ id: 'arguments-ordering' }] })),
    });
  const runnerFailingWith = (stdout: string) => () => {
    const error: any = new Error('DCM found issues');
    error.stdout = stdout;
    error.stderr = '✖ total lint style issues - 2';
    throw error;
  };
  const featuresConfig = printedConfig('/repo/features', [
    '/repo/features/**/*_test.dart',
    '/repo/features/test/**',
  ]);
  const fileExists = () => true;

  it('should pass when every finding is in a file its package excludes', () => {
    const result = dcmAnalyze(
      { cwd: '/repo', files: ['features/test/support/support.dart', 'features/lib/menu.dart'] },
      runnerFailingWith(
        featuresConfig +
          report(['features/test/support/support.dart', 'features/test/tab_bar/menu_test.dart'])
      ),
      fileExists
    );

    expect(result.success).toBe(true);
    expect(result.filesWithIssues).toEqual([]);
  });

  it('should report only the files their package does not exclude', () => {
    const result = dcmAnalyze(
      { cwd: '/repo', files: ['features/test/support/support.dart', 'features/lib/menu.dart'] },
      runnerFailingWith(
        featuresConfig + report(['features/test/support/support.dart', 'features/lib/menu.dart'])
      ),
      fileExists
    );

    expect(result.success).toBe(false);
    expect(result.filesWithIssues).toEqual(['features/lib/menu.dart']);
  });

  it('should keep every finding when DCM printed no configs', () => {
    const result = dcmAnalyze(
      { cwd: '/repo', files: ['features/test/a_test.dart'] },
      runnerFailingWith(report(['features/test/a_test.dart'])),
      fileExists
    );

    expect(result.success).toBe(false);
    expect(result.filesWithIssues).toEqual(['features/test/a_test.dart']);
  });
});
