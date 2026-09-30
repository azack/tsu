import { describe, it, expect } from 'vitest';
import { isGitRepo, getGitRoot, getChangedFiles, getAllChangedFiles, getCurrentBranch, getRemoteBranch, getStagedDiff, getBranchDiff, isMainBranch, hasUnstagedChanges, createCommit, getFilesInRange, getFilesToPush, } from './git.js';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
describe('isGitRepo', () => {
    it('should return true when in a git repository', () => {
        const result = isGitRepo(process.cwd());
        expect(result).toBe(true);
    });
    it('should return false when not in a git repository', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const result = isGitRepo(tempDir);
            expect(result).toBe(false);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return false for non-existent directory', () => {
        const result = isGitRepo('/this/path/does/not/exist/hopefully');
        expect(result).toBe(false);
    });
});
describe('getGitRoot', () => {
    it('should return the git root path when in a repository', () => {
        const result = getGitRoot(process.cwd());
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
        if (result) {
            expect(result.startsWith('/')).toBe(true);
        }
    });
    it('should return null when not in a git repository', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const result = getGitRoot(tempDir);
            expect(result).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return null for non-existent directory', () => {
        const result = getGitRoot('/this/path/does/not/exist/hopefully');
        expect(result).toBeNull();
    });
    it('should return same root for subdirectories in a repo', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            const subDir = join(tempDir, 'subdir', 'nested');
            execSync(`mkdir -p "${subDir}"`, { stdio: 'pipe' });
            const rootFromRoot = getGitRoot(tempDir);
            const rootFromSub = getGitRoot(subDir);
            expect(rootFromRoot).toBe(rootFromSub);
            expect(rootFromRoot).toBe(tempDir);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('getCurrentBranch', () => {
    it('should return null for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const branch = getCurrentBranch(tempDir);
            expect(branch).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return branch name for a git repo', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'test.txt'), 'test');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const branch = getCurrentBranch(tempDir);
            expect(branch).toBeTruthy();
            expect(['main', 'master']).toContain(branch);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('getChangedFiles', () => {
    it('should return null for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const files = getChangedFiles({ cwd: tempDir });
            expect(files).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return empty array when on base branch', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'test.txt'), 'test');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const files = getChangedFiles({ cwd: tempDir, baseBranch: 'main' });
            expect(files).toEqual([]);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return empty array when base branch does not exist', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'test.txt'), 'test');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const files = getChangedFiles({
                cwd: tempDir,
                baseBranch: 'nonexistent',
            });
            expect(files).toEqual([]);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return committed changes compared to base branch', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file2.txt'), 'content2');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "add file2"', { cwd: tempDir, stdio: 'pipe' });
            const files = getChangedFiles({ cwd: tempDir, baseBranch: 'main' });
            expect(files).toEqual(['file2.txt']);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return staged changes', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file2.txt'), 'content2');
            execSync('git add file2.txt', { cwd: tempDir, stdio: 'pipe' });
            const files = getChangedFiles({ cwd: tempDir, type: 'staged' });
            expect(files).toEqual(['file2.txt']);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return unstaged changes', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'modified content');
            const files = getChangedFiles({ cwd: tempDir, type: 'unstaged' });
            expect(files).toEqual(['file1.txt']);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return committed changes compared to base branch', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const diff = getStagedDiff(tempDir);
            expect(diff).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return diff when changes are staged', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file2.txt'), 'new content');
            execSync('git add file2.txt', { cwd: tempDir, stdio: 'pipe' });
            const diff = getStagedDiff(tempDir);
            expect(diff).toBeTruthy();
            expect(diff).toContain('file2.txt');
            expect(diff).toContain('new content');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('createCommit', () => {
    it('should return false for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const result = createCommit({ message: 'test', cwd: tempDir });
            expect(result).toBe(false);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should create commit with staged changes', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            const result = createCommit({ message: 'test commit', cwd: tempDir });
            expect(result).toBe(true);
            const log = execSync('git log --oneline', {
                cwd: tempDir,
                stdio: 'pipe',
                encoding: 'utf-8',
            });
            expect(log).toContain('test commit');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should handle multiline commit messages', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            const message = 'feat(test): add feature\n\nThis is a longer description';
            const result = createCommit({ message, cwd: tempDir });
            expect(result).toBe(true);
            const log = execSync('git log --format=%B -n 1', {
                cwd: tempDir,
                stdio: 'pipe',
                encoding: 'utf-8',
            });
            expect(log.trim()).toBe(message);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('getBranchDiff', () => {
    it('should return null for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const diff = getBranchDiff('main', tempDir);
            expect(diff).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return null when base branch does not exist', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const diff = getBranchDiff('nonexistent', tempDir);
            expect(diff).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return null when on base branch with no changes', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const diff = getBranchDiff('main', tempDir);
            expect(diff).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return diff between branches', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file2.txt'), 'new content');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "add file2"', { cwd: tempDir, stdio: 'pipe' });
            const diff = getBranchDiff('main', tempDir);
            expect(diff).toBeTruthy();
            expect(diff).toContain('file2.txt');
            expect(diff).toContain('new content');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('isMainBranch', () => {
    it('should return false for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const result = isMainBranch('main', tempDir);
            expect(result).toBe(false);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return true when on main branch', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const result = isMainBranch('main', tempDir);
            expect(result).toBe(true);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return false when on different branch', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            const result = isMainBranch('main', tempDir);
            expect(result).toBe(false);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('getAllChangedFiles', () => {
    it('should combine all changed files from committed, staged, and unstaged', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Initial commit"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git branch -m main', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'committed.txt'), 'committed');
            execSync('git add committed.txt', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Add committed file"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'staged.txt'), 'staged');
            execSync('git add staged.txt', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'unstaged.txt'), 'unstaged');
            const allFiles = getAllChangedFiles({ all: true }, tempDir);
            expect(allFiles).toContain('committed.txt');
            expect(allFiles).toContain('staged.txt');
            expect(allFiles.length).toBe(new Set(allFiles).size);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return empty array when no changes exist', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Initial commit"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            const allFiles = getAllChangedFiles({}, tempDir);
            expect(allFiles).toEqual([]);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should deduplicate files that appear in multiple categories', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Initial commit"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'modified');
            execSync('git add file1.txt', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Modify file1"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'modified again');
            execSync('git add file1.txt', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'modified yet again');
            const allFiles = getAllChangedFiles({ all: true }, tempDir);
            expect(allFiles).toEqual(['file1.txt']);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return empty array for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const allFiles = getAllChangedFiles({}, tempDir);
            expect(allFiles).toEqual([]);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should include unstaged tracked files but not untracked files', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'tracked.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Initial commit"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'tracked.txt'), 'modified');
            writeFileSync(join(tempDir, 'untracked.txt'), 'new file');
            const allFiles = getAllChangedFiles({ all: true }, tempDir);
            expect(allFiles).toContain('tracked.txt');
            expect(allFiles).not.toContain('untracked.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should default to push behavior when no options specified', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Initial commit"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git branch -m main', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature1.txt'), 'feature1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Add feature1"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'feature2.txt'), 'feature2');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Add feature2"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            const pushFiles = getAllChangedFiles({}, tempDir);
            expect(pushFiles).toContain('feature1.txt');
            expect(pushFiles).toContain('feature2.txt');
            expect(pushFiles).not.toContain('initial.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should support explicit push option', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Initial commit"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git branch -m main', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature.txt'), 'feature');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Add feature"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            const pushFiles = getAllChangedFiles({ push: true }, tempDir);
            expect(pushFiles).toContain('feature.txt');
            expect(pushFiles).not.toContain('initial.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should support staged option', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Initial commit"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'staged.txt'), 'staged');
            execSync('git add staged.txt', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'unstaged.txt'), 'unstaged');
            const stagedFiles = getAllChangedFiles({ staged: true }, tempDir);
            expect(stagedFiles).toContain('staged.txt');
            expect(stagedFiles).not.toContain('unstaged.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should support unstaged option', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'tracked.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Initial commit"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'staged.txt'), 'staged');
            execSync('git add staged.txt', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'tracked.txt'), 'modified');
            const unstagedFiles = getAllChangedFiles({ unstaged: true }, tempDir);
            expect(unstagedFiles).toContain('tracked.txt');
            expect(unstagedFiles).not.toContain('staged.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('hasUnstagedChanges', () => {
    it('should return false when file has no unstaged changes', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'test.txt'), 'content');
            execSync('git add test.txt', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Add test file"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            const result = hasUnstagedChanges('test.txt', tempDir);
            expect(result).toBe(false);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return true when file has unstaged changes', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'test.txt'), 'initial content');
            execSync('git add test.txt', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Add test file"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'test.txt'), 'modified content');
            const result = hasUnstagedChanges('test.txt', tempDir);
            expect(result).toBe(true);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should check entire repo when no file is specified', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'test.txt'), 'initial content');
            execSync('git add test.txt', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "Add test file"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'test.txt'), 'modified content');
            const result = hasUnstagedChanges(undefined, tempDir);
            expect(result).toBe(true);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return false when not in a git repo', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const result = hasUnstagedChanges('test.txt', tempDir);
            expect(result).toBe(false);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('getFilesInRange', () => {
    it('should return null for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const result = getFilesInRange({ range: 'HEAD~1..HEAD', cwd: tempDir });
            expect(result).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return files changed in a commit range', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file2.txt'), 'content2');
            writeFileSync(join(tempDir, 'file3.txt'), 'content3');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "add files"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesInRange({ range: 'HEAD~1..HEAD', cwd: tempDir });
            expect(files).toEqual(['file2.txt', 'file3.txt']);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should apply filter to files', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file2.dart'), 'content2');
            writeFileSync(join(tempDir, 'file3.txt'), 'content3');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "add files"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesInRange({
                range: 'HEAD~1..HEAD',
                cwd: tempDir,
                filter: (file) => file.endsWith('.dart'),
            });
            expect(files).toEqual(['file2.dart']);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return null on error (invalid range)', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesInRange({
                range: 'invalid..range',
                cwd: tempDir,
            });
            expect(files).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('getFilesToPush', () => {
    it('should return null for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const result = getFilesToPush(tempDir);
            expect(result).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should compare against base branch when no remote branch exists', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file2.txt'), 'content2');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "add file2"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesToPush(tempDir);
            expect(files).toEqual(['file2.txt']);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return empty array when on base branch with no remote', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesToPush(tempDir);
            expect(files).toEqual([]);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return files to push when remote branch exists', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file1.txt'), 'content1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
            execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
            execSync(`git remote add origin "${remoteDir}"`, {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b dev/feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file2.txt'), 'content2');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "add file2"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesToPush(tempDir);
            expect(files).toEqual(['file2.txt']);
            rmSync(remoteDir, { recursive: true, force: true });
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should only return feature branch changes after merging main (no remote)', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature.txt'), 'feature work');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "feature work"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout main', { cwd: tempDir, stdio: 'pipe' });
            for (let i = 1; i <= 3; i++) {
                writeFileSync(join(tempDir, `main${i}.txt`), `main work ${i}`);
                execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
                execSync(`git commit -m "main work ${i}"`, { cwd: tempDir, stdio: 'pipe' });
            }
            execSync('git checkout feature', { cwd: tempDir, stdio: 'pipe' });
            execSync('git merge main -m "Merge main"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesToPush(tempDir);
            expect(files).toEqual(['feature.txt']);
            expect(files).not.toContain('main1.txt');
            expect(files).not.toContain('main2.txt');
            expect(files).not.toContain('main3.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should handle multiple feature commits with merge (no remote)', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature1.txt'), 'feature work 1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "feature work 1"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'main1.txt'), 'main work');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "main work"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout feature', { cwd: tempDir, stdio: 'pipe' });
            execSync('git merge main -m "Merge main"', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature2.txt'), 'feature work 2');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "feature work 2"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesToPush(tempDir);
            expect(files).toContain('feature1.txt');
            expect(files).toContain('feature2.txt');
            expect(files).not.toContain('main1.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
describe('getRemoteBranch', () => {
    it('should return null for non-git directory', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'not-git-'));
        try {
            const result = getRemoteBranch(tempDir);
            expect(result).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return null when no remote exists', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file.txt'), 'content');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            const result = getRemoteBranch(tempDir);
            expect(result).toBeNull();
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it('should return remote branch when it exists', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'file.txt'), 'content');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
            execSync(`git remote add origin "${remoteDir}"`, {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });
            const result = getRemoteBranch(tempDir);
            expect(result).toBe('origin/main');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
            rmSync(remoteDir, { recursive: true, force: true });
        }
    });
});
describe('getFilesToPush with remote', () => {
    it('should return empty array when remote exists and no unpushed commits', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
            execSync(`git remote add origin "${remoteDir}"`, {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature.txt'), 'feature work');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "feature work"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git push -u origin feature', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesToPush(tempDir);
            expect(files).toEqual([]);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
            rmSync(remoteDir, { recursive: true, force: true });
        }
    });
    it('should return only new unpushed files when remote exists', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
            execSync(`git remote add origin "${remoteDir}"`, {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature1.txt'), 'feature work 1');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "feature work 1"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git push -u origin feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature2.txt'), 'feature work 2');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "feature work 2"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesToPush(tempDir);
            expect(files).toEqual(['feature2.txt']);
            expect(files).not.toContain('feature1.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
            rmSync(remoteDir, { recursive: true, force: true });
        }
    });
    it('should exclude merge commit files when pushing after merge', () => {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
        try {
            execSync('git init', { cwd: tempDir, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git config user.name "Test User"', {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git checkout -b main', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'initial.txt'), 'initial');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
            execSync(`git remote add origin "${remoteDir}"`, {
                cwd: tempDir,
                stdio: 'pipe',
            });
            execSync('git push -u origin main', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout -b feature', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'feature.txt'), 'feature work');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "feature work"', { cwd: tempDir, stdio: 'pipe' });
            execSync('git push -u origin feature', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout main', { cwd: tempDir, stdio: 'pipe' });
            for (let i = 1; i <= 3; i++) {
                writeFileSync(join(tempDir, `main${i}.txt`), `main work ${i}`);
                execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
                execSync(`git commit -m "main work ${i}"`, { cwd: tempDir, stdio: 'pipe' });
            }
            execSync('git push origin main', { cwd: tempDir, stdio: 'pipe' });
            execSync('git checkout feature', { cwd: tempDir, stdio: 'pipe' });
            execSync('git merge main -m "Merge main"', { cwd: tempDir, stdio: 'pipe' });
            writeFileSync(join(tempDir, 'new-feature.txt'), 'new feature work');
            execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
            execSync('git commit -m "new feature work"', { cwd: tempDir, stdio: 'pipe' });
            const files = getFilesToPush(tempDir);
            expect(files).toEqual(['new-feature.txt']);
            expect(files).not.toContain('feature.txt');
            expect(files).not.toContain('main1.txt');
            expect(files).not.toContain('main2.txt');
            expect(files).not.toContain('main3.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
            rmSync(remoteDir, { recursive: true, force: true });
        }
    });
});
describe('when local main is behind origin/main', () => {
    function setupStaleMainRepo() {
        const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')));
        const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')));
        const run = (command) => execSync(command, { cwd: tempDir, stdio: 'pipe' });
        const commit = (file) => {
            writeFileSync(join(tempDir, file), file);
            run('git add .');
            run(`git commit -m "${file}"`);
        };
        run('git init');
        run('git config user.email "test@test.com"');
        run('git config user.name "Test User"');
        run('git checkout -b main');
        commit('initial.txt');
        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        run(`git remote add origin "${remoteDir}"`);
        run('git push -u origin main');
        run('git checkout -b upstream-work');
        commit('upstream1.txt');
        commit('upstream2.txt');
        run('git push origin upstream-work:main');
        run('git checkout --no-track -b feature origin/main');
        run('git branch -D upstream-work');
        commit('feature.txt');
        return { tempDir, remoteDir };
    }
    it('getFilesToPush should exclude files that already landed on origin/main', () => {
        const { tempDir, remoteDir } = setupStaleMainRepo();
        try {
            expect(getFilesToPush({ cwd: tempDir, baseBranch: 'main' })).toEqual(['feature.txt']);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
            rmSync(remoteDir, { recursive: true, force: true });
        }
    });
    it('getChangedFiles should exclude files that already landed on origin/main', () => {
        const { tempDir, remoteDir } = setupStaleMainRepo();
        try {
            expect(getChangedFiles({ type: 'committed', baseBranch: 'main', cwd: tempDir })).toEqual([
                'feature.txt',
            ]);
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
            rmSync(remoteDir, { recursive: true, force: true });
        }
    });
    it('getBranchDiff should exclude changes that already landed on origin/main', () => {
        const { tempDir, remoteDir } = setupStaleMainRepo();
        try {
            const diff = getBranchDiff('main', tempDir);
            expect(diff).toContain('feature.txt');
            expect(diff).not.toContain('upstream1.txt');
            expect(diff).not.toContain('upstream2.txt');
        }
        finally {
            rmSync(tempDir, { recursive: true, force: true });
            rmSync(remoteDir, { recursive: true, force: true });
        }
    });
});
