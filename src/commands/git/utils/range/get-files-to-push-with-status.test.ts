import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { getFilesToPushWithStatus } from './get-files-to-push-with-status.js';

function initRepo(): string {
  const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
  execSync('git init', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'pipe' });
  execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
  return tempDir;
}

function advanceOriginMain(cwd: string, files: string[]): void {
  execSync('git checkout -b upstream-work origin/main', { cwd, stdio: 'pipe' });
  for (const file of files) {
    writeFileSync(join(cwd, file), file);
    execSync('git add .', { cwd, stdio: 'pipe' });
    execSync(`git commit -m "${file}"`, { cwd, stdio: 'pipe' });
  }
  execSync('git push origin upstream-work:main', { cwd, stdio: 'pipe' });
  execSync('git checkout main', { cwd, stdio: 'pipe' });
  execSync('git branch -D upstream-work', { cwd, stdio: 'pipe' });
  execSync('git fetch origin', { cwd, stdio: 'pipe' });
}

describe('getFilesToPushWithStatus', () => {
  it('should return null for a non-git directory', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
    try {
      expect(getFilesToPushWithStatus({ cwd: tempDir })).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return an empty array on the base branch', () => {
    const tempDir = initRepo();
    try {
      writeFileSync(join(tempDir, 'a.txt'), 'a');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      expect(getFilesToPushWithStatus({ cwd: tempDir, baseBranch: 'main' })).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should report feature-branch files with status when no remote exists', () => {
    const tempDir = initRepo();
    try {
      writeFileSync(join(tempDir, 'a.txt'), 'a');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'a.txt'), 'changed');
      writeFileSync(join(tempDir, 'b.txt'), 'new');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "feature"', { cwd: tempDir, stdio: 'pipe' });

      const result = getFilesToPushWithStatus({ cwd: tempDir, baseBranch: 'main' });
      expect(result).toEqual([
        { path: 'a.txt', status: 'M' },
        { path: 'b.txt', status: 'A' },
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should report only unpushed files with status when a remote exists', () => {
    const tempDir = initRepo();
    const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
    try {
      writeFileSync(join(tempDir, 'initial.txt'), 'initial');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

      execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
      execSync(`git remote add origin "${remoteDir}"`, { cwd: tempDir, stdio: 'pipe' });
      execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });

      execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'feature1.txt'), 'work 1');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "work 1"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git push -u origin feature', { cwd: tempDir, stdio: 'pipe' });

      writeFileSync(join(tempDir, 'feature2.txt'), 'work 2');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "work 2"', { cwd: tempDir, stdio: 'pipe' });

      const result = getFilesToPushWithStatus({ cwd: tempDir, baseBranch: 'main' });
      expect(result).toEqual([{ path: 'feature2.txt', status: 'A' }]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  describe('in a linked worktree', () => {
    it('reports feature-branch files with status from a worktree (no remote)', () => {
      const tempDir = initRepo();
      const worktreeParent = realpathSync(mkdtempSync(join(tmpdir(), 'git-worktree-')));
      const worktreeDir = join(worktreeParent, 'wt');
      try {
        writeFileSync(join(tempDir, 'a.txt'), 'a');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

        execSync(`git worktree add -b feature "${worktreeDir}"`, { cwd: tempDir, stdio: 'pipe' });
        writeFileSync(join(worktreeDir, 'a.txt'), 'changed');
        writeFileSync(join(worktreeDir, 'b.txt'), 'new');
        execSync('git add .', { cwd: worktreeDir, stdio: 'pipe' });
        execSync('git commit -m "feature"', { cwd: worktreeDir, stdio: 'pipe' });

        const result = getFilesToPushWithStatus({
          cwd: realpathSync(worktreeDir),
          baseBranch: 'main',
        });
        expect(result).toEqual([
          { path: 'a.txt', status: 'M' },
          { path: 'b.txt', status: 'A' },
        ]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(worktreeParent, { recursive: true, force: true });
      }
    });

    it('reports only unpushed files with status from a worktree (with remote)', () => {
      const tempDir = initRepo();
      const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
      const worktreeParent = realpathSync(mkdtempSync(join(tmpdir(), 'git-worktree-')));
      const worktreeDir = join(worktreeParent, 'wt');
      try {
        writeFileSync(join(tempDir, 'initial.txt'), 'initial');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        execSync(`git remote add origin "${remoteDir}"`, { cwd: tempDir, stdio: 'pipe' });
        execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });

        execSync(`git worktree add -b feature "${worktreeDir}"`, { cwd: tempDir, stdio: 'pipe' });
        writeFileSync(join(worktreeDir, 'feature1.txt'), 'work 1');
        execSync('git add .', { cwd: worktreeDir, stdio: 'pipe' });
        execSync('git commit -m "work 1"', { cwd: worktreeDir, stdio: 'pipe' });
        execSync('git push -u origin feature', { cwd: worktreeDir, stdio: 'pipe' });

        writeFileSync(join(worktreeDir, 'feature2.txt'), 'work 2');
        execSync('git add .', { cwd: worktreeDir, stdio: 'pipe' });
        execSync('git commit -m "work 2"', { cwd: worktreeDir, stdio: 'pipe' });

        const result = getFilesToPushWithStatus({
          cwd: realpathSync(worktreeDir),
          baseBranch: 'main',
        });
        expect(result).toEqual([{ path: 'feature2.txt', status: 'A' }]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(remoteDir, { recursive: true, force: true });
        rmSync(worktreeParent, { recursive: true, force: true });
      }
    });
  });

  describe('when local main is behind origin/main', () => {
    it('excludes upstream files from a worktree branched off origin/main (first push)', () => {
      const tempDir = initRepo();
      const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
      const worktreeParent = realpathSync(mkdtempSync(join(tmpdir(), 'git-worktree-')));
      const worktreeDir = join(worktreeParent, 'wt');
      try {
        writeFileSync(join(tempDir, 'initial.txt'), 'initial');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        execSync(`git remote add origin "${remoteDir}"`, { cwd: tempDir, stdio: 'pipe' });
        execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });

        advanceOriginMain(tempDir, ['upstream1.txt', 'upstream2.txt']);

        execSync(`git worktree add --no-track -b feature "${worktreeDir}" origin/main`, {
          cwd: tempDir,
          stdio: 'pipe',
        });
        writeFileSync(join(worktreeDir, 'feature.txt'), 'feature');
        execSync('git add .', { cwd: worktreeDir, stdio: 'pipe' });
        execSync('git commit -m "feature"', { cwd: worktreeDir, stdio: 'pipe' });

        const result = getFilesToPushWithStatus({
          cwd: realpathSync(worktreeDir),
          baseBranch: 'main',
        });
        expect(result).toEqual([{ path: 'feature.txt', status: 'A' }]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(remoteDir, { recursive: true, force: true });
        rmSync(worktreeParent, { recursive: true, force: true });
      }
    });

    it('checks local-only base commits but not upstream files when local main has diverged', () => {
      const tempDir = initRepo();
      const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
      try {
        writeFileSync(join(tempDir, 'initial.txt'), 'initial');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        execSync(`git remote add origin "${remoteDir}"`, { cwd: tempDir, stdio: 'pipe' });
        execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });

        writeFileSync(join(tempDir, 'local-only.txt'), 'unpushed on main');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "local only"', { cwd: tempDir, stdio: 'pipe' });
        advanceOriginMain(tempDir, ['upstream1.txt', 'upstream2.txt']);

        execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
        writeFileSync(join(tempDir, 'feature.txt'), 'feature');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "feature"', { cwd: tempDir, stdio: 'pipe' });
        execSync('git merge --no-edit origin/main', { cwd: tempDir, stdio: 'pipe' });

        const result = getFilesToPushWithStatus({ cwd: tempDir, baseBranch: 'main' });
        expect(result).toEqual([
          { path: 'feature.txt', status: 'A' },
          { path: 'local-only.txt', status: 'A' },
        ]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });

    it('excludes upstream files from a detached HEAD when origin/HEAD is set', () => {
      const tempDir = initRepo();
      const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
      try {
        writeFileSync(join(tempDir, 'initial.txt'), 'initial');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        execSync(`git remote add origin "${remoteDir}"`, { cwd: tempDir, stdio: 'pipe' });
        execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });
        execSync('git remote set-head origin main', { cwd: tempDir, stdio: 'pipe' });

        advanceOriginMain(tempDir, ['upstream1.txt', 'upstream2.txt']);

        execSync('git checkout --detach origin/main', { cwd: tempDir, stdio: 'pipe' });
        writeFileSync(join(tempDir, 'feature.txt'), 'feature');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "feature"', { cwd: tempDir, stdio: 'pipe' });

        const result = getFilesToPushWithStatus({ cwd: tempDir, baseBranch: 'main' });
        expect(result).toEqual([{ path: 'feature.txt', status: 'A' }]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });

    it('excludes upstream files from a detached HEAD when origin/HEAD is not set', () => {
      const tempDir = initRepo();
      const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
      try {
        writeFileSync(join(tempDir, 'initial.txt'), 'initial');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        execSync(`git remote add origin "${remoteDir}"`, { cwd: tempDir, stdio: 'pipe' });
        execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });

        advanceOriginMain(tempDir, ['upstream1.txt', 'upstream2.txt']);

        execSync('git checkout --detach origin/main', { cwd: tempDir, stdio: 'pipe' });
        writeFileSync(join(tempDir, 'feature.txt'), 'feature');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "feature"', { cwd: tempDir, stdio: 'pipe' });

        const result = getFilesToPushWithStatus({ cwd: tempDir, baseBranch: 'main' });
        expect(result).toEqual([{ path: 'feature.txt', status: 'A' }]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });

    it('checks branch files in a shallow clone whose stale main is outside the shallow history', () => {
      const sourceDir = initRepo();
      const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
      const cloneParent = realpathSync(mkdtempSync(join(tmpdir(), 'git-shallow-')));
      const cloneDir = join(cloneParent, 'clone');
      try {
        for (const file of ['initial.txt', 'history1.txt', 'history2.txt', 'history3.txt']) {
          writeFileSync(join(sourceDir, file), file);
          execSync('git add .', { cwd: sourceDir, stdio: 'pipe' });
          execSync(`git commit -m "${file}"`, { cwd: sourceDir, stdio: 'pipe' });
        }
        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        execSync(`git remote add origin "${remoteDir}"`, { cwd: sourceDir, stdio: 'pipe' });
        execSync('git push -u origin main', { cwd: sourceDir, stdio: 'pipe' });

        execSync(`git clone --depth 2 --branch main "file://${remoteDir}" "${cloneDir}"`, {
          stdio: 'pipe',
        });
        execSync('git config user.email "test@test.com"', { cwd: cloneDir, stdio: 'pipe' });
        execSync('git config user.name "Test User"', { cwd: cloneDir, stdio: 'pipe' });

        for (const file of ['upstream1.txt', 'upstream2.txt', 'upstream3.txt']) {
          writeFileSync(join(sourceDir, file), file);
          execSync('git add .', { cwd: sourceDir, stdio: 'pipe' });
          execSync(`git commit -m "${file}"`, { cwd: sourceDir, stdio: 'pipe' });
        }
        execSync('git push origin main', { cwd: sourceDir, stdio: 'pipe' });

        execSync('git fetch --depth 2 origin main', { cwd: cloneDir, stdio: 'pipe' });
        execSync('git checkout --no-track -b feature origin/main', {
          cwd: cloneDir,
          stdio: 'pipe',
        });
        writeFileSync(join(cloneDir, 'feature.txt'), 'feature');
        execSync('git add .', { cwd: cloneDir, stdio: 'pipe' });
        execSync('git commit -m "feature"', { cwd: cloneDir, stdio: 'pipe' });

        const result = getFilesToPushWithStatus({ cwd: cloneDir, baseBranch: 'main' });
        expect(result).toEqual([{ path: 'feature.txt', status: 'A' }]);
      } finally {
        rmSync(sourceDir, { recursive: true, force: true });
        rmSync(remoteDir, { recursive: true, force: true });
        rmSync(cloneParent, { recursive: true, force: true });
      }
    });

    it('excludes upstream files after merging origin/main into a pushed branch', () => {
      const tempDir = initRepo();
      const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
      try {
        writeFileSync(join(tempDir, 'initial.txt'), 'initial');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        execSync(`git remote add origin "${remoteDir}"`, { cwd: tempDir, stdio: 'pipe' });
        execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });

        execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
        writeFileSync(join(tempDir, 'feature1.txt'), 'work 1');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "work 1"', { cwd: tempDir, stdio: 'pipe' });
        execSync('git push -u origin feature', { cwd: tempDir, stdio: 'pipe' });

        advanceOriginMain(tempDir, ['upstream1.txt', 'upstream2.txt']);

        execSync('git checkout feature', { cwd: tempDir, stdio: 'pipe' });
        execSync('git merge --no-edit origin/main', { cwd: tempDir, stdio: 'pipe' });
        writeFileSync(join(tempDir, 'feature2.txt'), 'work 2');
        execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
        execSync('git commit -m "work 2"', { cwd: tempDir, stdio: 'pipe' });

        const result = getFilesToPushWithStatus({ cwd: tempDir, baseBranch: 'main' });
        expect(result).toEqual([{ path: 'feature2.txt', status: 'A' }]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(remoteDir, { recursive: true, force: true });
      }
    });
  });
});
