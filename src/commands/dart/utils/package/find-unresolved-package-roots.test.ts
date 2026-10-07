import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findUnresolvedPackageRoots } from './find-unresolved-package-roots.js';

describe('findUnresolvedPackageRoots', () => {
  let outer: string;
  let repo: string;

  const write = (path: string, contents = ''): void => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  };

  beforeEach(() => {
    outer = realpathSync(mkdtempSync(join(tmpdir(), 'tsu-unresolved-')));
    repo = join(outer, 'worktrees', 'feature');
    write(join(repo, 'pubspec.yaml'), 'workspace:\n  - features\n');
    write(join(repo, 'features', 'pubspec.yaml'), 'resolution: workspace\n');
    write(join(repo, 'features', 'lib', 'a.dart'));
    write(join(repo, 'features', 'test', 'a_test.dart'));
    write(join(repo, 'tool', 'pubspec.yaml'));
    write(join(repo, 'tool', 'bin', 'tool.dart'));
    write(join(repo, 'docs', 'notes.dart'));
  });

  afterEach(() => {
    rmSync(outer, { recursive: true, force: true });
  });

  it('should treat a workspace member as resolved when the workspace root is', () => {
    write(join(repo, '.dart_tool', 'package_config.json'), '{}');

    expect(findUnresolvedPackageRoots(['features/lib/a.dart'], repo, repo)).toEqual([]);
  });

  it('should report each unresolved package once', () => {
    expect(
      findUnresolvedPackageRoots(
        ['features/lib/a.dart', 'features/test/a_test.dart', 'tool/bin/tool.dart'],
        repo,
        repo
      )
    ).toEqual([join(repo, 'features'), join(repo, 'tool')]);
  });

  it('should not count a package config above the repository', () => {
    write(join(outer, '.dart_tool', 'package_config.json'), '{}');

    expect(findUnresolvedPackageRoots(['features/lib/a.dart'], repo, repo)).toEqual([
      join(repo, 'features'),
    ]);
  });

  it("should accept a package's own package config", () => {
    write(join(repo, 'tool', '.dart_tool', 'package_config.json'), '{}');

    expect(findUnresolvedPackageRoots(['tool/bin/tool.dart'], repo, repo)).toEqual([]);
  });

  it('should resolve file paths against cwd', () => {
    expect(findUnresolvedPackageRoots(['lib/a.dart'], join(repo, 'features'), repo)).toEqual([
      join(repo, 'features'),
    ]);
  });

  it('should ignore files that belong to no package', () => {
    rmSync(join(repo, 'pubspec.yaml'));

    expect(findUnresolvedPackageRoots(['docs/notes.dart'], repo, repo)).toEqual([]);
  });
});
