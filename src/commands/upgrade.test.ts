import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { upgrade } from './upgrade.js';
import * as versionUtils from '../utils/version.js';

// Mock the version utilities
vi.mock('../utils/version.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/version.js')>()),
  checkForUpdate: vi.fn(),
  upgradeFromGitHub: vi.fn(),
  detectPackageManager: vi.fn(),
  getTsuOnPath: vi.fn(),
}));

const UNDETECTED_NOTE =
  "Couldn't detect how tsu was installed; using pnpm. Pass -p npm|pnpm|yarn to override.";

describe('upgrade', () => {
  let consoleErrorSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    // Mock detectPackageManager to return null so it falls back to pnpm default
    vi.mocked(versionUtils.detectPackageManager).mockReturnValue(null);
    vi.mocked(versionUtils.getTsuOnPath).mockReturnValue({
      path: '/usr/local/bin/tsu',
      version: '0.7.0',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should exit with code 0 when already up-to-date', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: '0.6.0',
      latestVersion: '0.6.0',
    });

    await expect(upgrade()).rejects.toThrow('process.exit(0)');

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(versionUtils.upgradeFromGitHub).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(UNDETECTED_NOTE);
  });

  it('should call upgradeFromGitHub when update is available', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);

    await expect(upgrade()).rejects.toThrow('process.exit(0)');

    expect(versionUtils.upgradeFromGitHub).toHaveBeenCalledWith('bestdan', 'tsu', 'pnpm', '0.7.0');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should use specified package manager', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);

    await expect(upgrade({ packageManager: 'pnpm' })).rejects.toThrow('process.exit(0)');

    expect(versionUtils.upgradeFromGitHub).toHaveBeenCalledWith('bestdan', 'tsu', 'pnpm', '0.7.0');
  });

  it('should show verbose output when verbose flag is enabled and up-to-date', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: '0.6.0',
      latestVersion: '0.6.0',
    });

    await expect(upgrade({ verbose: true })).rejects.toThrow('process.exit(0)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('🔍 Checking for updates...');
    expect(consoleErrorSpy).toHaveBeenCalledWith('✓ Already on the latest version (0.6.0)');
  });

  it('should show verbose output when verbose flag is enabled and upgrading', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);

    await expect(upgrade({ verbose: true })).rejects.toThrow('process.exit(0)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('🔍 Checking for updates...');
    expect(consoleErrorSpy).toHaveBeenCalledWith('📦 Current version: 0.6.0');
    expect(consoleErrorSpy).toHaveBeenCalledWith('✨ Latest version: 0.7.0');
    expect(consoleErrorSpy).toHaveBeenCalledWith('📥 Upgrading using pnpm...');
    expect(consoleErrorSpy).toHaveBeenCalledWith('✓ Successfully upgraded to version 0.7.0');
  });

  it('should use the detected package manager when none is specified', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.detectPackageManager).mockReturnValue('yarn');
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);

    await expect(upgrade()).rejects.toThrow('process.exit(0)');

    expect(versionUtils.upgradeFromGitHub).toHaveBeenCalledWith('bestdan', 'tsu', 'yarn', '0.7.0');
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(UNDETECTED_NOTE);
  });

  it('should say it is assuming pnpm when the package manager cannot be detected', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);

    await expect(upgrade()).rejects.toThrow('process.exit(0)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(UNDETECTED_NOTE);
  });

  it('should not print the detection note when a package manager is specified', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);

    await expect(upgrade({ packageManager: 'pnpm' })).rejects.toThrow('process.exit(0)');

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(UNDETECTED_NOTE);
  });

  it('should succeed when the installed tsu is newer than the latest release', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);
    vi.mocked(versionUtils.getTsuOnPath).mockReturnValue({
      path: '/Users/me/Library/pnpm/bin/tsu',
      version: '0.8.0',
    });

    await expect(upgrade({ verbose: true })).rejects.toThrow('process.exit(0)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('✓ Successfully upgraded to version 0.8.0');
  });

  it('should exit with code 1 when the tsu on PATH still reports the old version', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);
    vi.mocked(versionUtils.getTsuOnPath).mockReturnValue({
      path: '/Users/me/Library/pnpm/tsu',
      version: '0.6.0',
    });

    await expect(upgrade()).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Installed 0.7.0 with pnpm, but the tsu on PATH (/Users/me/Library/pnpm/tsu) reports 0.6.0.'
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith('✓ Successfully upgraded to version 0.7.0');
  });

  it('should exit with code 1 when no tsu is on PATH after installing', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
    });
    vi.mocked(versionUtils.upgradeFromGitHub).mockReturnValue(undefined);
    vi.mocked(versionUtils.getTsuOnPath).mockReturnValue({ path: null, version: null });

    await expect(upgrade({ packageManager: 'npm' })).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Installed 0.7.0 with npm, but the tsu on PATH (not found) reports no version.'
    );
  });

  it('should exit with code 1 on error', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockRejectedValue(new Error('Network error'));

    await expect(upgrade()).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should show error message in verbose mode on error', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockRejectedValue(new Error('Network error'));

    await expect(upgrade({ verbose: true })).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to upgrade'));
  });
});
