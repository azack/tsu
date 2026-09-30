import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { getChangedFilesWithStatus } from './get-changed-files-with-status.js';

function initRepo(): string {
  const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
  execSync('git init', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
  return tempDir;
}

describe('getChangedFilesWithStatus', () => {
  it('should return null for a non-git directory', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
    try {
      expect(getChangedFilesWithStatus({ cwd: tempDir, type: 'staged' })).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should report staged files with their status', () => {
    const tempDir = initRepo();
    try {
      writeFileSync(join(tempDir, 'a.txt'), 'a');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      writeFileSync(join(tempDir, 'a.txt'), 'changed');
      writeFileSync(join(tempDir, 'b.txt'), 'new');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });

      const result = getChangedFilesWithStatus({ cwd: tempDir, type: 'staged' });
      expect(result).toEqual([
        { path: 'a.txt', status: 'M' },
        { path: 'b.txt', status: 'A' },
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should report committed files relative to the base branch', () => {
    const tempDir = initRepo();
    try {
      writeFileSync(join(tempDir, 'a.txt'), 'a');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'c.txt'), 'new');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "add c"', { cwd: tempDir, stdio: 'pipe' });

      const result = getChangedFilesWithStatus({
        cwd: tempDir,
        type: 'committed',
        baseBranch: 'main',
      });
      expect(result).toEqual([{ path: 'c.txt', status: 'A' }]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty for committed changes on the base branch', () => {
    const tempDir = initRepo();
    try {
      writeFileSync(join(tempDir, 'a.txt'), 'a');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      const result = getChangedFilesWithStatus({
        cwd: tempDir,
        type: 'committed',
        baseBranch: 'main',
      });
      expect(result).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should exclude committed files that already landed on origin/main when local main is behind', () => {
    const tempDir = initRepo();
    const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
    try {
      writeFileSync(join(tempDir, 'initial.txt'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
      execSync(`git remote add origin "${remoteDir}"`, { cwd: tempDir, stdio: 'pipe' });
      execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });

      execSync('git checkout -b upstream-work', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'upstream.txt'), 'upstream');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "upstream"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git push origin upstream-work:main', { cwd: tempDir, stdio: 'pipe' });

      execSync('git checkout --no-track -b feature origin/main', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'feature.txt'), 'feature');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "feature"', { cwd: tempDir, stdio: 'pipe' });

      const result = getChangedFilesWithStatus({
        cwd: tempDir,
        type: 'committed',
        baseBranch: 'main',
      });
      expect(result).toEqual([{ path: 'feature.txt', status: 'A' }]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });
});
