import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { findDartPackageRoot } from './find-dart-package-root.js';
export function findUnresolvedPackageRoots(files, cwd, repoRoot) {
    const boundary = resolve(repoRoot);
    const unresolved = new Set();
    for (const file of files) {
        const packageRoot = findDartPackageRoot(dirname(resolve(cwd, file)));
        if (packageRoot &&
            isInside(packageRoot, boundary) &&
            !hasPackageConfig(packageRoot, boundary)) {
            unresolved.add(packageRoot);
        }
    }
    return [...unresolved].sort();
}
function isInside(path, boundary) {
    const fromBoundary = relative(boundary, path);
    const outside = fromBoundary === '..' || fromBoundary.startsWith(`..${sep}`) || isAbsolute(fromBoundary);
    return !outside;
}
function hasPackageConfig(packageRoot, boundary) {
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
