import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseDartAnalyzeOutput,
  dartAnalyze,
  DartAnalyzeTimeoutError,
} from './dart-analyze-parse.js';

describe('parseDartAnalyzeOutput', () => {
  it('should parse single issue from dart analyze output', () => {
    const output = `Analyzing ....                         11.1s

   info • lib/account/screens/account_screen/account_screen.dart:102:16 • Use 'const' with the constructor to improve
          performance. Try adding the 'const' keyword to the constructor invocation. • prefer_const_constructors

1 issue found.`;

    const issues = parseDartAnalyzeOutput(output);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      severity: 'info',
      filePath: 'lib/account/screens/account_screen/account_screen.dart',
      line: 102,
      column: 16,
      message:
        "Use 'const' with the constructor to improve\n          performance. Try adding the 'const' keyword to the constructor invocation.",
      code: 'prefer_const_constructors',
    });
  });

  it('should parse multiple issues from dart analyze output', () => {
    const output = `Analyzing ....                         5.2s

   info • lib/models/user.dart:10:5 • Prefer const constructors. • prefer_const_constructors
   warning • lib/services/api.dart:25:10 • Unused import. • unused_import
   error • lib/main.dart:50:20 • Undefined name 'nonExistent'. • undefined_identifier

3 issues found.`;

    const issues = parseDartAnalyzeOutput(output);

    expect(issues).toHaveLength(3);
    expect(issues[0]).toEqual({
      severity: 'info',
      filePath: 'lib/models/user.dart',
      line: 10,
      column: 5,
      message: 'Prefer const constructors.',
      code: 'prefer_const_constructors',
    });
    expect(issues[1]).toEqual({
      severity: 'warning',
      filePath: 'lib/services/api.dart',
      line: 25,
      column: 10,
      message: 'Unused import.',
      code: 'unused_import',
    });
    expect(issues[2]).toEqual({
      severity: 'error',
      filePath: 'lib/main.dart',
      line: 50,
      column: 20,
      message: "Undefined name 'nonExistent'.",
      code: 'undefined_identifier',
    });
  });

  it('should return empty array for clean output', () => {
    const output = `Analyzing ....                         3.5s

No issues found!`;

    const issues = parseDartAnalyzeOutput(output);
    expect(issues).toHaveLength(0);
  });

  it('should handle output with no issues', () => {
    const output = `Analyzing ....                         2.1s

0 issues found.`;

    const issues = parseDartAnalyzeOutput(output);
    expect(issues).toHaveLength(0);
  });

  it('should handle empty output', () => {
    const issues = parseDartAnalyzeOutput('');
    expect(issues).toHaveLength(0);
  });

  it('should handle multi-line messages', () => {
    const output = `Analyzing ....                         4.3s

   info • lib/widgets/button.dart:15:8 • This widget should be const for better performance.
          Consider making this widget immutable. • prefer_const_constructors

1 issue found.`;

    const issues = parseDartAnalyzeOutput(output);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('This widget should be const');
  });

  it('should parse issues with dash separators (when analyzing specific files)', () => {
    const output = `Analyzing main.dart, user.dart...

  error - lib/main.dart:1:8 - Target of URI doesn't exist: 'package:test_package/models/user.dart'. Try creating the file referenced by the URI, or try using a URI for a file that does exist. - uri_does_not_exist
  error - lib/main.dart:2:8 - Target of URI doesn't exist: 'package:test_package/services/auth.dart'. Try creating the file referenced by the URI, or try using a URI for a file that does exist. - uri_does_not_exist

2 issues found.`;

    const issues = parseDartAnalyzeOutput(output);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      severity: 'error',
      filePath: 'lib/main.dart',
      line: 1,
      column: 8,
      message:
        "Target of URI doesn't exist: 'package:test_package/models/user.dart'. Try creating the file referenced by the URI, or try using a URI for a file that does exist.",
      code: 'uri_does_not_exist',
    });
    expect(issues[1]).toEqual({
      severity: 'error',
      filePath: 'lib/main.dart',
      line: 2,
      column: 8,
      message:
        "Target of URI doesn't exist: 'package:test_package/services/auth.dart'. Try creating the file referenced by the URI, or try using a URI for a file that does exist.",
      code: 'uri_does_not_exist',
    });
  });
});

describe('dartAnalyze', () => {
  it('should return success when no issues found', () => {
    const mockRunner = () => 'Analyzing ....\n\nNo issues found!';

    const result = dartAnalyze({ cwd: '/test/path' }, mockRunner);

    expect(result.success).toBe(true);
    expect(result.filesWithIssues).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect issues and return failure', () => {
    const mockRunner = () => {
      const error: any = new Error('dart analyze failed');
      error.stdout = `Analyzing ....

   info • lib/main.dart:10:5 • Prefer const. • prefer_const_constructors

1 issue found.`;
      error.code = 1;
      throw error;
    };

    const result = dartAnalyze({ cwd: '/test/path' }, mockRunner);

    expect(result.success).toBe(false);
    expect(result.filesWithIssues).toEqual(['lib/main.dart']);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe('prefer_const_constructors');
  });

  it('should handle multiple files with issues', () => {
    const mockRunner = () => {
      const error: any = new Error('dart analyze failed');
      error.stdout = `Analyzing ....

   info • lib/main.dart:10:5 • Message 1 • code1
   warning • lib/user.dart:20:10 • Message 2 • code2
   info • lib/main.dart:30:15 • Message 3 • code3

3 issues found.`;
      error.code = 1;
      throw error;
    };

    const result = dartAnalyze({ cwd: '/test/path' }, mockRunner);

    expect(result.success).toBe(false);
    expect(result.filesWithIssues).toHaveLength(2);
    expect(result.filesWithIssues).toContain('lib/main.dart');
    expect(result.filesWithIssues).toContain('lib/user.dart');
    expect(result.issues).toHaveLength(3);
  });

  it('should throw error on timeout', () => {
    const mockRunner = () => {
      const error: any = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    };

    expect(() => {
      dartAnalyze({ cwd: '/test/path' }, mockRunner);
    }).toThrow(new DartAnalyzeTimeoutError('/test/path', 20000));
  });

  it('should not report an outside SIGTERM as a timeout', () => {
    const mockRunner = () => {
      const error: any = new Error('Terminated');
      error.signal = 'SIGTERM';
      throw error;
    };

    let thrown: unknown;
    try {
      dartAnalyze({ cwd: '/test/path' }, mockRunner);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DartAnalyzeTimeoutError);
  });

  it('should throw error when dart analyze fails without output', () => {
    const mockRunner = () => {
      const error: any = new Error('Failed');
      error.stdout = '';
      error.stderr = 'dart command not found';
      throw error;
    };

    expect(() => {
      dartAnalyze({ cwd: '/test/path' }, mockRunner);
    }).toThrow('dart analyze failed');
    expect(() => {
      dartAnalyze({ cwd: '/test/path' }, mockRunner);
    }).toThrow('dart command not found');
  });

  it('should use default timeout when not specified', () => {
    let timeoutUsed = 0;
    const mockRunner = (_packageRoot: string, timeout: number) => {
      timeoutUsed = timeout;
      return 'No issues found!';
    };

    dartAnalyze({ cwd: '/test/path' }, mockRunner);

    expect(timeoutUsed).toBe(20000);
  });

  it('should use specified timeout', () => {
    let timeoutUsed = 0;
    const mockRunner = (_packageRoot: string, timeout: number) => {
      timeoutUsed = timeout;
      return 'No issues found!';
    };

    dartAnalyze({ cwd: '/test/path', timeout: 30000 }, mockRunner);

    expect(timeoutUsed).toBe(30000);
  });

  it('should group files by package root and pass them to dart analyze', () => {
    const callsMade: Array<{ packageRoot: string; files?: string[] }> = [];
    const mockRunner = (packageRoot: string, _timeout: number, files?: string[]) => {
      callsMade.push({ packageRoot, files });
      return 'No issues found!';
    };

    // When files don't have discoverable package roots (in test),
    // they fall back to using cwd as the package root
    dartAnalyze(
      {
        cwd: '/test/path',
        files: ['lib/main.dart', 'lib/user.dart'],
      },
      mockRunner
    );

    // Verify that dart analyze was called at least once
    expect(callsMade.length).toBeGreaterThan(0);
    // When no package roots are found for files, it falls back to cwd with no specific files
    expect(callsMade[0]?.packageRoot).toBe('/test/path');
  });

  it('should analyze all files when no specific files provided', () => {
    let filesReceived: string[] | undefined;
    const mockRunner = (_packageRoot: string, _timeout: number, files?: string[]) => {
      filesReceived = files;
      return 'No issues found!';
    };

    dartAnalyze({ cwd: '/test/path' }, mockRunner);

    expect(filesReceived).toBeUndefined();
  });

  it('should handle dash-separated output format when analyzing specific files', () => {
    const mockRunner = (_packageRoot: string, _timeout: number, _files?: string[]) => {
      const error: any = new Error('dart analyze failed');
      error.stdout = `Analyzing main.dart...

  error - lib/main.dart:10:5 - Some error message - error_code

1 issue found.`;
      error.code = 1;
      throw error;
    };

    const result = dartAnalyze(
      {
        cwd: '/test/path',
        files: ['lib/main.dart'],
      },
      mockRunner
    );

    expect(result.success).toBe(false);
    expect(result.filesWithIssues).toContain('lib/main.dart');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe('error_code');
  });

  it('should combine results from multiple packages when files span multiple packages', () => {
    const callsMade: Array<{ packageRoot: string; files?: string[] }> = [];
    const mockRunner = (_packageRoot: string, _timeout: number, files?: string[]) => {
      callsMade.push({ packageRoot: _packageRoot, files });
      return 'No issues found!';
    };

    // Note: In actual usage, findDartPackageRoot would return different roots
    // but in our test, all files will fall back to cwd since there are no real package roots
    dartAnalyze(
      {
        cwd: '/test/monorepo',
        files: ['packages/app/lib/main.dart', 'packages/core/lib/utils.dart'],
      },
      mockRunner
    );

    // Verify dart analyze was called
    expect(callsMade.length).toBeGreaterThan(0);
  });

  it('should properly pass relative paths to dart analyze runner', () => {
    let receivedFiles: string[] | undefined;
    const mockRunner = (_packageRoot: string, _timeout: number, files?: string[]) => {
      receivedFiles = files;
      return 'No issues found!';
    };

    dartAnalyze(
      {
        cwd: '/test/path',
        files: ['lib/main.dart'],
      },
      mockRunner
    );

    // Files are either passed as relative paths or not passed at all
    // (depends on whether package roots are found)
    if (receivedFiles) {
      expect(receivedFiles.every((f) => !f.startsWith('/'))).toBe(true);
    }
  });

  it('should deduplicate files with issues from the same file', () => {
    const mockRunner = () => {
      const error: any = new Error('dart analyze failed');
      error.stdout = `Analyzing main.dart...

  error - lib/main.dart:10:5 - Error 1 - error_code_1
  error - lib/main.dart:20:10 - Error 2 - error_code_2

2 issues found.`;
      error.code = 1;
      throw error;
    };

    const result = dartAnalyze({ cwd: '/test/path', files: ['lib/main.dart'] }, mockRunner);

    expect(result.issues).toHaveLength(2);
    expect(result.filesWithIssues).toHaveLength(1);
    expect(result.filesWithIssues[0]).toBe('lib/main.dart');
  });

  it('should find package roots and convert files to relative paths with real fixtures', () => {
    const packageRootsUsed: string[] = [];
    const relativePathsUsed: string[][] = [];

    const mockRunner = (packageRoot: string, _timeout: number, files?: string[]) => {
      packageRootsUsed.push(packageRoot);
      if (files) {
        relativePathsUsed.push(files);
      }
      return 'No issues found!';
    };

    // Use actual fixture path so findDartPackageRoot can find pubspec.yaml
    const fixturesPath = new URL('../__fixtures__/dart-package', import.meta.url).pathname;

    const result = dartAnalyze(
      {
        cwd: fixturesPath,
        files: ['lib/main.dart', 'lib/models/user.dart'],
      },
      mockRunner
    );

    expect(result.success).toBe(true);
    // Should have found the package root
    expect(packageRootsUsed.length).toBe(1);
    expect(packageRootsUsed[0]).toBe(fixturesPath);
    // Files should be passed as relative paths
    expect(relativePathsUsed.length).toBe(1);
    expect(relativePathsUsed[0]).toEqual(['lib/main.dart', 'lib/models/user.dart']);
  });

  it('should handle multiple files in different packages', () => {
    const packageRootsUsed: string[] = [];

    const mockRunner = (packageRoot: string, _timeout: number, _files?: string[]) => {
      packageRootsUsed.push(packageRoot);
      return 'No issues found!';
    };

    // Use monorepo fixture with multiple packages
    const monorepoPath = new URL('../__fixtures__/dart-monorepo', import.meta.url).pathname;

    const result = dartAnalyze(
      {
        cwd: monorepoPath,
        // Files from different packages should result in multiple analyze calls
        files: ['lib/src/utils.dart', 'lib/src/models.dart'],
      },
      mockRunner
    );

    expect(result.success).toBe(true);
    // Should have analyzed at least one package
    expect(packageRootsUsed.length).toBeGreaterThan(0);
  });
});

describe('dartAnalyze when one of several packages times out', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'tsu-analyze-')));
    for (const name of ['a', 'b']) {
      mkdirSync(join(root, name, 'lib'), { recursive: true });
      writeFileSync(join(root, name, 'pubspec.yaml'), `name: ${name}\n`);
      writeFileSync(join(root, name, 'lib', `${name}.dart`), '');
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const runnerWith =
    (outcomes: Record<string, 'issue' | 'timeout' | 'clean'>) => (packageRoot: string) => {
      const outcome = outcomes[packageRoot.slice(root.length + 1)];
      if (outcome === 'clean') {
        return 'No issues found!';
      }
      const error: any = new Error('dart analyze failed');
      if (outcome === 'timeout') {
        error.code = 'ETIMEDOUT';
      } else {
        error.stdout = "  error - lib/a.dart:1:1 - Undefined name 'x'. - undefined_identifier\n";
      }
      throw error;
    };

  it.each([
    ['a/lib/a.dart', 'b/lib/b.dart'],
    ['b/lib/b.dart', 'a/lib/a.dart'],
  ])('should keep the issues one package reports when another times out (%s first)', (...files) => {
    const result = dartAnalyze({ cwd: root, files }, runnerWith({ a: 'issue', b: 'timeout' }));

    expect(result.success).toBe(false);
    expect(result.filesWithIssues).toEqual(['lib/a.dart']);
    expect(result.timedOutPackageRoots).toEqual([join(root, 'b')]);
  });

  it('should throw a timeout when every package times out', () => {
    expect(() =>
      dartAnalyze(
        { cwd: root, files: ['a/lib/a.dart', 'b/lib/b.dart'] },
        runnerWith({ a: 'timeout', b: 'timeout' })
      )
    ).toThrow(DartAnalyzeTimeoutError);
  });

  it('should throw a timeout when the only other package is clean', () => {
    expect(() =>
      dartAnalyze(
        { cwd: root, files: ['a/lib/a.dart', 'b/lib/b.dart'] },
        runnerWith({ a: 'clean', b: 'timeout' })
      )
    ).toThrow(new DartAnalyzeTimeoutError(join(root, 'b'), 20000));
  });
});
