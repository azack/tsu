import { describe, it, expect } from 'vitest';
import { packageManagerFromPaths } from './package-manager-from-paths.js';

describe('packageManagerFromPaths', () => {
  it('should detect npm from a global bin symlink resolved into lib/node_modules', () => {
    expect(
      packageManagerFromPaths([
        '/usr/local/bin/tsu',
        '/usr/local/lib/node_modules/@bestdan/tsu/dist/cli.js',
      ])
    ).toBe('npm');
  });

  it('should detect pnpm from its global bin directory', () => {
    expect(packageManagerFromPaths(['/Users/me/Library/pnpm/bin/tsu'])).toBe('pnpm');
    expect(packageManagerFromPaths(['/home/me/.local/share/pnpm/tsu'])).toBe('pnpm');
  });

  it('should detect yarn from the unresolved ~/.yarn/bin link', () => {
    expect(packageManagerFromPaths(['/Users/me/.yarn/bin/tsu'])).toBe('yarn');
  });

  it('should detect yarn from a prefix bin link resolved into ~/.config/yarn', () => {
    expect(
      packageManagerFromPaths([
        '/opt/homebrew/bin/tsu',
        '/Users/me/.config/yarn/global/node_modules/@bestdan/tsu/dist/cli.js',
      ])
    ).toBe('yarn');
  });

  it('should return null for an unrecognized path', () => {
    expect(packageManagerFromPaths(['/usr/local/bin/tsu'])).toBeNull();
  });
});
