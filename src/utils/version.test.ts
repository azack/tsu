import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCurrentVersion,
  getLatestGitHubVersion,
  compareVersions,
  checkForUpdate,
  buildUpgradeCommand,
  packageManagerFromPaths,
} from './version.js';

// Mock fs and child_process modules
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('version utilities', () => {
  describe('getCurrentVersion', () => {
    it('should return the version from package.json', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '0.6.0' }));

      const version = getCurrentVersion();
      expect(version).toBe('0.6.0');
    });

    it('should throw error if package.json cannot be read', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => getCurrentVersion()).toThrow('Failed to read current version from package.json');
    });
  });

  describe('compareVersions', () => {
    it('should return -1 when current version is older', () => {
      expect(compareVersions('0.5.0', '0.6.0')).toBe(-1);
      expect(compareVersions('0.6.0', '1.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('should return 0 when versions are equal', () => {
      expect(compareVersions('0.6.0', '0.6.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should return 1 when current version is newer', () => {
      expect(compareVersions('0.7.0', '0.6.0')).toBe(1);
      expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });

    it('should handle versions with different number of parts', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0', '1.0.1')).toBe(-1);
      expect(compareVersions('1.0.1', '1.0')).toBe(1);
    });
  });

  describe('getLatestGitHubVersion', () => {
    let globalFetch: any;

    beforeEach(() => {
      globalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = globalFetch;
    });

    it('should fetch and return the latest version from GitHub', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: 'v0.7.0' }),
      });

      const version = await getLatestGitHubVersion('bestdan', 'tsu');
      expect(version).toBe('0.7.0');
    });

    it('should remove v prefix from tag name', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: 'v1.2.3' }),
      });

      const version = await getLatestGitHubVersion('bestdan', 'tsu');
      expect(version).toBe('1.2.3');
    });

    it('should handle versions without v prefix', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: '1.2.3' }),
      });

      const version = await getLatestGitHubVersion('bestdan', 'tsu');
      expect(version).toBe('1.2.3');
    });

    it('should throw error when API request fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(getLatestGitHubVersion('bestdan', 'tsu')).rejects.toThrow(
        'GitHub API request failed: Not Found'
      );
    });

    it('should throw error when fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(getLatestGitHubVersion('bestdan', 'tsu')).rejects.toThrow(
        'Failed to fetch latest version from GitHub'
      );
    });
  });

  describe('checkForUpdate', () => {
    let globalFetch: any;

    beforeEach(() => {
      globalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = globalFetch;
    });

    it('should return update available when latest version is newer', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '0.6.0' }));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: 'v0.7.0' }),
      });

      const result = await checkForUpdate('bestdan', 'tsu');
      expect(result).toEqual({
        updateAvailable: true,
        currentVersion: '0.6.0',
        latestVersion: '0.7.0',
      });
    });

    it('should return no update when versions are equal', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '0.6.0' }));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: 'v0.6.0' }),
      });

      const result = await checkForUpdate('bestdan', 'tsu');
      expect(result).toEqual({
        updateAvailable: false,
        currentVersion: '0.6.0',
        latestVersion: '0.6.0',
      });
    });

    it('should return no update when current version is newer', async () => {
      const fs = await import('node:fs');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '0.7.0' }));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: 'v0.6.0' }),
      });

      const result = await checkForUpdate('bestdan', 'tsu');
      expect(result).toEqual({
        updateAvailable: false,
        currentVersion: '0.7.0',
        latestVersion: '0.6.0',
      });
    });
  });

  describe('buildUpgradeCommand', () => {
    it('should install npm upgrades from the release tarball', () => {
      expect(buildUpgradeCommand('bestdan', 'tsu', 'npm', '0.29.0')).toBe(
        'npm install -g https://codeload.github.com/bestdan/tsu/tar.gz/refs/tags/v0.29.0'
      );
    });

    it('should fall back to the github: spec for npm without a version', () => {
      expect(buildUpgradeCommand('bestdan', 'tsu', 'npm')).toBe(
        'npm install -g github:bestdan/tsu'
      );
    });

    it('should pin pnpm and yarn to the release tag', () => {
      expect(buildUpgradeCommand('bestdan', 'tsu', 'pnpm', '0.29.0')).toBe(
        'pnpm add -g github:bestdan/tsu#v0.29.0'
      );
      expect(buildUpgradeCommand('bestdan', 'tsu', 'yarn', '0.29.0')).toBe(
        'yarn global add github:bestdan/tsu#v0.29.0'
      );
    });

    it('should use the unpinned github: spec for pnpm and yarn without a version', () => {
      expect(buildUpgradeCommand('bestdan', 'tsu', 'pnpm')).toBe('pnpm add -g github:bestdan/tsu');
      expect(buildUpgradeCommand('bestdan', 'tsu', 'yarn')).toBe(
        'yarn global add github:bestdan/tsu'
      );
    });

    it('should reject a version that is not X.Y.Z', () => {
      expect(() => buildUpgradeCommand('bestdan', 'tsu', 'npm', '0.29.0; rm -rf ~')).toThrow(
        'Invalid version'
      );
    });

    it('should reject an invalid owner or repo', () => {
      expect(() => buildUpgradeCommand('best dan', 'tsu', 'npm', '0.29.0')).toThrow(
        'Invalid GitHub owner'
      );
      expect(() => buildUpgradeCommand('bestdan', 'tsu;ls', 'npm', '0.29.0')).toThrow(
        'Invalid GitHub repo'
      );
    });
  });

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
      expect(
        packageManagerFromPaths([
          '/Users/me/.yarn/bin/tsu',
          '/Users/me/.config/yarn/global/node_modules/@bestdan/tsu/dist/cli.js',
        ])
      ).toBe('yarn');
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
});
