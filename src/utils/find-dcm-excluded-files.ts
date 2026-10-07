import { dirname, resolve, sep } from 'node:path';
import { globToRegExp } from './glob-to-regexp.js';
import { splitJsonObjects } from './split-json-objects.js';

interface PrintedDcmConfig {
  'analysis-options-path': string;
  'global-excludes': string[];
}

interface PackageExcludes {
  root: string;
  excludes: RegExp[];
}

/**
 * Returns the `paths` (relative to `cwd`) that their package's analysis_options.yaml excludes,
 * through `analyzer: exclude` or `dart_code_metrics: rules-exclude`, read from the merged
 * configs `dcm analyze --print-config` prints. DCM applies those excludes when it scans a
 * directory but not to files named on the command line, so a check of changed files has to.
 * A path that no printed config covers is never treated as excluded.
 */
export function findDcmExcludedFiles(output: string, paths: string[], cwd: string): Set<string> {
  const packages = splitJsonObjects(output)
    .filter(isPrintedDcmConfig)
    .map((config) => ({
      root: dirname(config['analysis-options-path']),
      excludes: config['global-excludes'].map(globToRegExp),
    }));

  return new Set(paths.filter((path) => isExcluded(resolve(cwd, path), packages)));
}

function isPrintedDcmConfig(value: unknown): value is PrintedDcmConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const excludes = record['global-excludes'];
  return (
    typeof record['analysis-options-path'] === 'string' &&
    Array.isArray(excludes) &&
    excludes.every((exclude) => typeof exclude === 'string')
  );
}

function isExcluded(absolutePath: string, packages: PackageExcludes[]): boolean {
  const owner = packages
    .filter((pkg) => absolutePath.startsWith(pkg.root + sep))
    .sort((a, b) => b.root.length - a.root.length)[0];
  return owner !== undefined && owner.excludes.some((exclude) => exclude.test(absolutePath));
}
