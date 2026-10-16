import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { findDartPackageRoot } from './find-dart-package-root.js';

/**
 * Returns the package roots of `files` (relative to `cwd`) with no
 * `.dart_tool/package_config.json` in the package or any directory above it, up to
 * `repoRoot`. The analyzer and DCM keep looking above the repository for one, so in
 * an unresolved checkout nested inside another, such as a linked worktree under the
 * main checkout, they quietly resolve imports against the outer checkout's code.
 * Files outside any package inside `repoRoot` are ignored.
 */
export function findUnresolvedPackageRoots(
  files: string[],
  cwd: string,
  repoRoot: string
): string[] {
  const boundary = resolve(repoRoot);
  const unresolved = new Set<string>();

  for (const file of files) {
    const packageRoot = findDartPackageRoot(dirname(resolve(cwd, file)));
    if (
      packageRoot &&
      isInside(packageRoot, boundary) &&
      !hasPackageConfig(packageRoot, boundary)
    ) {
      unresolved.add(packageRoot);
    }
  }

  return [...unresolved].sort();
}

function isInside(path: string, boundary: string): boolean {
  const fromBoundary = relative(boundary, path);
  // Match `..` as a whole path component, so a directory such as `..hidden` still counts as inside
  const outside =
    fromBoundary === '..' || fromBoundary.startsWith(`..${sep}`) || isAbsolute(fromBoundary);
  return !outside;
}

function hasPackageConfig(packageRoot: string, boundary: string): boolean {
  let directory = packageRoot;
  for (;;) {
    if (existsSync(join(directory, '.dart_tool', 'package_config.json'))) {
      return true;
    }
    const parent = dirname(directory);
    if (directory === boundary || parent === directory) {
      return false;
    }
    directory = parent;
  }
}
