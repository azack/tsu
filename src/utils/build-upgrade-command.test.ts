import { describe, it, expect } from 'vitest';
import { buildUpgradeCommand } from './build-upgrade-command.js';

describe('buildUpgradeCommand', () => {
  it('should install npm upgrades from the release tarball', () => {
    expect(buildUpgradeCommand('bestdan', 'tsu', 'npm', 'v0.29.0')).toBe(
      'npm install -g https://codeload.github.com/bestdan/tsu/tar.gz/refs/tags/v0.29.0'
    );
  });

  it('should fall back to the github: spec for npm without a tag', () => {
    expect(buildUpgradeCommand('bestdan', 'tsu', 'npm')).toBe('npm install -g github:bestdan/tsu');
  });

  it('should pin pnpm and yarn to the release tag', () => {
    expect(buildUpgradeCommand('bestdan', 'tsu', 'pnpm', 'v0.29.0')).toBe(
      'pnpm add -g github:bestdan/tsu#v0.29.0'
    );
    expect(buildUpgradeCommand('bestdan', 'tsu', 'yarn', 'v0.29.0')).toBe(
      'yarn global add github:bestdan/tsu#v0.29.0'
    );
  });

  it('should use a tag without a v prefix as-is', () => {
    expect(buildUpgradeCommand('bestdan', 'tsu', 'pnpm', '0.29.0')).toBe(
      'pnpm add -g github:bestdan/tsu#0.29.0'
    );
    expect(buildUpgradeCommand('bestdan', 'tsu', 'npm', '0.29.0')).toBe(
      'npm install -g https://codeload.github.com/bestdan/tsu/tar.gz/refs/tags/0.29.0'
    );
  });

  it('should use the unpinned github: spec for pnpm and yarn without a tag', () => {
    expect(buildUpgradeCommand('bestdan', 'tsu', 'pnpm')).toBe('pnpm add -g github:bestdan/tsu');
    expect(buildUpgradeCommand('bestdan', 'tsu', 'yarn')).toBe(
      'yarn global add github:bestdan/tsu'
    );
  });

  it('should reject a tag that is not vX.Y.Z or X.Y.Z', () => {
    expect(() => buildUpgradeCommand('bestdan', 'tsu', 'npm', 'v0.29.0; rm -rf ~')).toThrow(
      'Invalid release tag'
    );
  });

  it('should reject an invalid owner or repo', () => {
    expect(() => buildUpgradeCommand('best dan', 'tsu', 'npm', 'v0.29.0')).toThrow(
      'Invalid GitHub owner'
    );
    expect(() => buildUpgradeCommand('bestdan', 'tsu;ls', 'npm', 'v0.29.0')).toThrow(
      'Invalid GitHub repo'
    );
  });
});
