import { execSync } from 'node:child_process';
import { isGitRepo, getGitStatus, getAllChangedFiles } from '../../git/utils/git.js';
import { isDartPackage } from '../../dart/utils/dart.js';
import { ensureCondition, displayFileList } from '../../../utils/command-helpers.js';
import { isCommandInstalled } from '../../../utils/shell.js';
import { logIfVerbose } from '../../../utils/logger.js';
import { setVerbose } from '../../../utils/verbose-state.js';
import { withoutGitRepositoryEnv } from '../../../utils/without-git-repository-env.js';
export async function dartHookGraphqlCheck(options = {}) {
    const verbose = options.verbose || false;
    const codegenCommands = ['melos run codegen:graphql', 'melos run codegen:graphql:test'];
    setVerbose(verbose);
    logIfVerbose(verbose, '🧪 Checking for modified GraphQL files...');
    ensureCondition(isGitRepo(), 'Error: Not in a git repository');
    ensureCondition(isDartPackage(), 'Error: Not in a Dart package');
    const cwd = process.cwd();
    const allFiles = getAllChangedFiles(options, cwd);
    const graphqlFiles = allFiles.filter((file) => file.endsWith('.graphql'));
    ensureCondition(graphqlFiles.length > 0, verbose ? '✓ No GraphQL files modified (skipping)' : '', { exitCode: 0 });
    displayFileList({
        files: graphqlFiles,
        verbose,
        message: 'Running GraphQL codegen on',
    });
    ensureCondition(isCommandInstalled('melos'), verbose ? '⚠️  Warning: Melos not installed, skipping' : '', { exitCode: 0 });
    const gitStatusBefore = getGitStatus(cwd);
    ensureCondition(gitStatusBefore !== null, 'Error: Failed to get git status');
    logIfVerbose(verbose, '🔧 Running GraphQL code generation...');
    try {
        for (const command of codegenCommands) {
            execSync(command, {
                cwd,
                env: withoutGitRepositoryEnv(),
                stdio: verbose ? 'inherit' : 'pipe',
            });
        }
    }
    catch (error) {
        console.error('Error: Failed to run GraphQL code generation');
        if (error instanceof Error) {
            console.error(error.message);
        }
        process.exit(1);
    }
    const gitStatusAfter = getGitStatus(cwd);
    ensureCondition(gitStatusAfter !== null, 'Error: Failed to get git status');
    if (gitStatusBefore && gitStatusAfter && gitStatusBefore !== gitStatusAfter) {
        console.error('');
        console.error('⚠️  WARNING: GraphQL fakes need regeneration!');
        console.error('   Modified files:');
        try {
            const beforeLines = new Set(gitStatusBefore.split('\n').filter((line) => line.length > 0));
            const afterLines = gitStatusAfter.split('\n').filter((line) => line.length > 0);
            const changedFiles = afterLines.filter((line) => !beforeLines.has(line));
            if (changedFiles.length > 0) {
                changedFiles.forEach((line) => {
                    const match = line.match(/^..\s+(.+)$/);
                    if (match && match[1]) {
                        console.error(`   ${match[1]}`);
                    }
                });
            }
            else {
                console.error('   (Unable to determine changed files)');
            }
        }
        catch {
            console.error('   (Unable to determine changed files)');
        }
        console.error('');
        console.error(`   Run 'melos run codegen:graphql && melos run codegen:graphql:test' and commit changes`);
        process.exit(1);
    }
    logIfVerbose(verbose, '✓ GraphQL fakes are up to date');
    process.exit(0);
}
