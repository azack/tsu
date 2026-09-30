// Re-export all git utilities from their new locations for backward compatibility

// Repository operations
export { isGitRepo } from './repo/is-git-repo.js';
export { getGitRoot } from './repo/get-git-root.js';
export { getCurrentBranch } from './repo/get-current-branch.js';
export { getRemoteBranch } from './repo/get-remote-branch.js';
export { resolveBaseRef } from './repo/resolve-base-ref.js';

// Changed files operations
export {
  getChangedFiles,
  type ChangeType,
  type GetChangedFilesOptions,
} from './changed-files/get-changed-files.js';
export { getAllChangedFiles } from './changed-files/get-all-changed-files.js';
export { getAllChangedFilesWithStatus } from './changed-files/get-all-changed-files-with-status.js';
export { getChangedFilesWithStatus } from './changed-files/get-changed-files-with-status.js';
export { isCodeownersRelevant } from './changed-files/is-codeowners-relevant.js';
export { type ChangedFileEntry, type ChangeStatus } from './changed-files/changed-file-entry.js';

// Diff operations
export { getStagedDiff } from './diff/get-staged-diff.js';
export { getBranchDiff } from './diff/get-branch-diff.js';

// Branch operations
export { isMainBranch } from './branch/is-main-branch.js';

// Claude AI integration
export { callClaude, type CallClaudeOptions } from './claude/call-claude.js';
export {
  generateCommitMessage,
  type GenerateCommitMessageOptions,
} from './claude/generate-commit-message.js';
export {
  generatePRDescription,
  type GeneratePRDescriptionOptions,
} from './claude/generate-pr-description.js';

// Commit operations
export { createCommit, type CreateCommitOptions } from './commit/create-commit.js';
export { hasUnstagedChanges } from './commit/has-unstaged-changes.js';
export { getGitStatus } from './commit/get-git-status.js';

// Range/push operations
export { getFilesInRange, type GetFilesInRangeOptions } from './range/get-files-in-range.js';
export {
  getFilesInRangeWithStatus,
  type GetFilesInRangeWithStatusOptions,
} from './range/get-files-in-range-with-status.js';
export { getFilesToPush, type GetFilesToPushOptions } from './range/get-files-to-push.js';
export {
  getFilesToPushWithStatus,
  type GetFilesToPushWithStatusOptions,
} from './range/get-files-to-push-with-status.js';
