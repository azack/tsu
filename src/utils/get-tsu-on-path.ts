import { execSync } from 'node:child_process';

/**
 * Reports which `tsu` is first on this process's PATH and the version it prints.
 * @returns The `which tsu` path and the version, each null if it couldn't be determined
 */
/* v8 ignore next -- @preserve */
export function getTsuOnPath(): { path: string | null; version: string | null } {
  let path: string | null = null;
  let version: string | null = null;
  try {
    path = execSync('which tsu', { encoding: 'utf-8', stdio: 'pipe' }).trim() || null;
  } catch {
    // tsu not on PATH
  }
  try {
    version = execSync('tsu --version', { encoding: 'utf-8', stdio: 'pipe' }).trim() || null;
  } catch {
    // tsu not runnable
  }
  return { path, version };
}
