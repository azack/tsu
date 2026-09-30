/**
 * Infers the package manager that owns a global `tsu` from its paths.
 * @param paths - The `tsu` path on PATH and, when it's a symlink, its resolved target.
 *   npm's global bin (e.g. `/usr/local/bin/tsu`) only reveals npm once resolved into
 *   `lib/node_modules`, while yarn's `~/.yarn/bin` link resolves into `~/.config/yarn`.
 * @returns The package manager, or null if no path matches
 */
export function packageManagerFromPaths(paths: string[]): 'npm' | 'pnpm' | 'yarn' | null {
  const matches = (needles: string[]) =>
    paths.some((path) => needles.some((needle) => path.includes(needle)));

  if (matches(['/Library/pnpm/', '/.local/share/pnpm/'])) {
    return 'pnpm';
  }
  if (matches(['/.yarn/', '/Yarn/', '/.config/yarn/'])) {
    return 'yarn';
  }
  if (matches(['/lib/node_modules/', '/.npm/'])) {
    return 'npm';
  }
  return null;
}
