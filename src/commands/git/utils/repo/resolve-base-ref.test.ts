import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { resolveBaseRef } from './resolve-base-ref.js';

function git(command: string, cwd: string): void {
  execSync(`git ${command}`, { cwd, stdio: 'pipe' });
}

function commitFile(cwd: string, file: string, content = file): void {
  writeFileSync(join(cwd, file), content);
  git('add .', cwd);
  git(`commit -m "${file}"`, cwd);
}

describe('resolveBaseRef', () => {
  let repoDir: string;
  let remoteDir: string;

  beforeEach(() => {
    repoDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
    remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
    git('init', repoDir);
    git('config user.email "test@test.com"', repoDir);
    git('config user.name "Test User"', repoDir);
    git('config commit.gpgsign false', repoDir);
    git('checkout -b main', repoDir);
    commitFile(repoDir, 'initial.txt');
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(remoteDir, { recursive: true, force: true });
  });

  function addRemote(): void {
    git('init --bare', remoteDir);
    git(`remote add origin "${remoteDir}"`, repoDir);
    git('push -u origin main', repoDir);
  }

  function advanceOriginMain(file: string): void {
    git('checkout -b upstream-work origin/main', repoDir);
    commitFile(repoDir, file);
    git('push origin upstream-work:main', repoDir);
    git('checkout main', repoDir);
    git('branch -D upstream-work', repoDir);
    git('fetch origin', repoDir);
  }

  it('should return null for a non-git directory', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
    try {
      expect(resolveBaseRef('main', tempDir)).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return null when neither the local nor remote base branch exists', () => {
    expect(resolveBaseRef('develop', repoDir)).toBeNull();
  });

  it('should return the local branch when there is no remote', () => {
    git('checkout -b feature', repoDir);
    commitFile(repoDir, 'feature.txt');

    expect(resolveBaseRef('main', repoDir)).toBe('main');
  });

  it('should return the local branch when it matches origin', () => {
    addRemote();
    git('checkout -b feature', repoDir);
    commitFile(repoDir, 'feature.txt');

    expect(resolveBaseRef('main', repoDir)).toBe('main');
  });

  it('should return origin when local main is behind and the branch forked from origin', () => {
    addRemote();
    advanceOriginMain('upstream.txt');
    git('checkout --no-track -b feature origin/main', repoDir);
    commitFile(repoDir, 'feature.txt');

    expect(resolveBaseRef('main', repoDir)).toBe('origin/main');
  });

  it('should return origin when local main is behind and origin was merged into the branch', () => {
    addRemote();
    git('checkout -b feature', repoDir);
    commitFile(repoDir, 'feature.txt');
    advanceOriginMain('upstream.txt');
    git('checkout feature', repoDir);
    git('merge --no-edit origin/main', repoDir);

    expect(resolveBaseRef('main', repoDir)).toBe('origin/main');
  });

  it('should return the local branch when origin advanced but the branch has not picked it up', () => {
    addRemote();
    git('checkout -b feature', repoDir);
    commitFile(repoDir, 'feature.txt');
    advanceOriginMain('upstream.txt');
    git('checkout feature', repoDir);

    expect(resolveBaseRef('main', repoDir)).toBe('main');
  });

  it('should return the local branch when it is ahead of origin', () => {
    addRemote();
    commitFile(repoDir, 'local-only.txt');
    git('checkout -b feature', repoDir);
    commitFile(repoDir, 'feature.txt');

    expect(resolveBaseRef('main', repoDir)).toBe('main');
  });

  it('should return origin when the local base branch does not exist', () => {
    addRemote();
    git('checkout -b feature', repoDir);
    commitFile(repoDir, 'feature.txt');
    git('branch -D main', repoDir);

    expect(resolveBaseRef('main', repoDir)).toBe('origin/main');
  });

  it('should leave an explicit remote ref unchanged', () => {
    addRemote();
    git('checkout -b feature', repoDir);
    commitFile(repoDir, 'feature.txt');

    expect(resolveBaseRef('origin/main', repoDir)).toBe('origin/main');
  });
});
