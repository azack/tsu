import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkVersion } from './version.js';
import * as versionUtils from '../../utils/version.js';

// Mock the version utilities
vi.mock('../../utils/version.js', () => ({
  checkForUpdate: vi.fn(),
}));

describe('checkVersion', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should exit with code 0 when up-to-date', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: '0.6.0',
      latestVersion: '0.6.0',
      latestTag: 'v0.6.0',
    });

    await expect(checkVersion()).rejects.toThrow('process.exit(0)');

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(consoleLogSpy).toHaveBeenCalledWith('current: 0.6.0');
    expect(consoleLogSpy).toHaveBeenCalledWith('latest: 0.6.0');
    expect(consoleLogSpy).toHaveBeenCalledWith('update_available: false');
  });

  it('should exit with code 1 when update is available', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
      latestTag: 'v0.7.0',
    });

    await expect(checkVersion()).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleLogSpy).toHaveBeenCalledWith('current: 0.6.0');
    expect(consoleLogSpy).toHaveBeenCalledWith('latest: 0.7.0');
    expect(consoleLogSpy).toHaveBeenCalledWith('update_available: true');
  });

  it('should show verbose output when verbose flag is enabled and up-to-date', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: '0.6.0',
      latestVersion: '0.6.0',
      latestTag: 'v0.6.0',
    });

    await expect(checkVersion({ verbose: true })).rejects.toThrow('process.exit(0)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('🔍 Checking for updates...');
    expect(consoleErrorSpy).toHaveBeenCalledWith('✓ You are on the latest version (0.6.0)');
  });

  it('should show verbose output when verbose flag is enabled and update available', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
      latestTag: 'v0.7.0',
    });

    await expect(checkVersion({ verbose: true })).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith('🔍 Checking for updates...');
    expect(consoleErrorSpy).toHaveBeenCalledWith('📦 Current version: 0.6.0');
    expect(consoleErrorSpy).toHaveBeenCalledWith('✨ Latest version: 0.7.0');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "⚠️  Update available! Run 'tsu upgrade' to update."
    );
  });

  it('should exit with code 1 on error', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockRejectedValue(new Error('Network error'));

    await expect(checkVersion()).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should show error message in verbose mode on error', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockRejectedValue(new Error('Network error'));

    await expect(checkVersion({ verbose: true })).rejects.toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('❌ Failed to check for updates')
    );
  });

  it('should output parseable format to stdout for scripting', async () => {
    vi.mocked(versionUtils.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
      latestTag: 'v0.7.0',
    });

    await expect(checkVersion()).rejects.toThrow('process.exit(1)');

    // Verify parseable output
    const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]);
    expect(outputs).toContain('current: 0.6.0');
    expect(outputs).toContain('latest: 0.7.0');
    expect(outputs).toContain('update_available: true');
  });
});
