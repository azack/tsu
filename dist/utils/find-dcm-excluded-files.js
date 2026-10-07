import { dirname, resolve, sep } from 'node:path';
import { globToRegExp } from './glob-to-regexp.js';
import { splitJsonObjects } from './split-json-objects.js';
export function findDcmExcludedFiles(output, paths, cwd) {
    const packages = splitJsonObjects(output)
        .filter(isPrintedDcmConfig)
        .map((config) => ({
        root: dirname(config['analysis-options-path']),
        excludes: config['global-excludes'].map(globToRegExp),
    }));
    return new Set(paths.filter((path) => isExcluded(resolve(cwd, path), packages)));
}
function isPrintedDcmConfig(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value;
    const excludes = record['global-excludes'];
    return (typeof record['analysis-options-path'] === 'string' &&
        Array.isArray(excludes) &&
        excludes.every((exclude) => typeof exclude === 'string'));
}
function isExcluded(absolutePath, packages) {
    const owner = packages
        .filter((pkg) => absolutePath.startsWith(pkg.root + sep))
        .sort((a, b) => b.root.length - a.root.length)[0];
    return owner !== undefined && owner.excludes.some((exclude) => exclude.test(absolutePath));
}
