// Export utilities that can be imported by other packages

// Types
export type {
  BaseCommandOptions,
  CheckCommandOptions,
  GetValueCommandOptions,
  ChangedFilesOptions,
} from './types/command-options.js';

// Git utilities
export {
  isGitRepo,
  getGitRoot,
  getChangedFiles,
  getChangedFilesWithStatus,
  getAllChangedFiles,
  getAllChangedFilesWithStatus,
  getFilesInRange,
  getFilesInRangeWithStatus,
  getFilesToPush,
  getFilesToPushWithStatus,
  isCodeownersRelevant,
  getCurrentBranch,
  resolveBaseRef,
  getStagedDiff,
  getBranchDiff,
  isMainBranch,
  callClaude,
  generateCommitMessage,
  generatePRDescription,
  createCommit,
  hasUnstagedChanges,
  type ChangeType,
  type ChangeStatus,
  type ChangedFileEntry,
  type GetChangedFilesOptions,
  type GetFilesInRangeOptions,
  type GetFilesInRangeWithStatusOptions,
  type GetFilesToPushWithStatusOptions,
  type CallClaudeOptions,
  type GenerateCommitMessageOptions,
  type GeneratePRDescriptionOptions,
  type CreateCommitOptions,
} from './commands/git/utils/git.js';

// Shell utilities
export {
  escapeShellArg,
  isCommandInstalled,
  isSafeShellInput,
  safeShellArg,
} from './utils/shell.js';

// File utilities
export { filterFilesBySuffix } from './commands/files/utils/files.js';

// Verbose state utilities
export { setVerbose, isVerbose, resetVerbose } from './utils/verbose-state.js';

// Command helper utilities
export {
  displayChangedFiles,
  getChangedFilesWithOptions,
  ensureCondition,
  ensureDartInstalled,
  ensureDCMInstalled,
  ensureClaudeInstalled,
  type DisplayChangedFilesOptions,
} from './utils/command-helpers.js';

// Dart utilities
export {
  findDartPackageRoot,
  findFilePackageRoot,
  readPackageName,
  readPackageIndex,
  findAffectedPackages,
  isDartPackage,
  findAllDartFiles,
  TSU_PACKAGE_INDEX,
  COMMON_DART_CODEGEN_SUFFIXES,
  type PackageIndexEntry,
} from './commands/dart/utils/dart.js';

// Hook utilities
export {
  dartHookFormatCheck,
  type DartHookFormatCheckOptions,
} from './commands/hook/format/check.js';

export {
  dartHookAnalysisCheck,
  type DartHookAnalysisCheckOptions,
} from './commands/hook/analysis/check.js';

export { dartHookFixCheck, type DartHookFixCheckOptions } from './commands/hook/fix/check.js';

export { dartHookDcmCheck, type DartHookDcmCheckOptions } from './commands/hook/dcm/fix/check.js';

export {
  dartHookDcmAnalyzeCheck,
  type DartHookDcmAnalyzeCheckOptions,
} from './commands/hook/dcm/analyze/check.js';

export {
  dartHookGraphqlCheck,
  type DartHookGraphqlCheckOptions,
} from './commands/hook/graphql/check.js';

export { dartFix, type DartFixOptions } from './commands/dart/fix.js';

// DCM utilities
export {
  parseDcmAnalyzeOutput,
  dcmAnalyze,
  DcmTimeoutError,
  type CallAndParseDcmOptions,
  type CallAndParseDcmResult,
} from './utils/dcm-parse.js';

export { dartDcmAnalyze, type DartDcmAnalyzeOptions } from './commands/dart/dcm/analyze.js';

// Check utilities
export { checkExternals, type CheckExternalsOptions } from './commands/check/externals.js';

// Error logging utilities
export {
  logError,
  getErrorLogPath,
  isErrorLoggingEnabled,
  sanitizeErrorMessage,
  createErrorContext,
  type ErrorLogConfig,
  type ErrorContext,
} from './utils/error-logger.js';
