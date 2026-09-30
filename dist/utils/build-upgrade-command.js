function isValidGitHubName(name) {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
}
export function buildUpgradeCommand(owner, repo, packageManager, tag) {
    if (!isValidGitHubName(owner)) {
        throw new Error(`Invalid GitHub owner: "${owner}". Must be alphanumeric with hyphens/underscores.`);
    }
    if (!isValidGitHubName(repo)) {
        throw new Error(`Invalid GitHub repo: "${repo}". Must be alphanumeric with hyphens/underscores.`);
    }
    if (tag !== undefined && !/^v?\d+\.\d+\.\d+$/.test(tag)) {
        throw new Error(`Invalid release tag: "${tag}". Must be in vX.Y.Z or X.Y.Z format.`);
    }
    const githubUrl = `github:${owner}/${repo}`;
    const githubSpec = tag ? `${githubUrl}#${tag}` : githubUrl;
    switch (packageManager) {
        case 'pnpm':
            return `pnpm add -g ${githubSpec}`;
        case 'yarn':
            return `yarn global add ${githubSpec}`;
        case 'npm':
        default:
            return tag
                ? `npm install -g https://codeload.github.com/${owner}/${repo}/tar.gz/refs/tags/${tag}`
                : `npm install -g ${githubUrl}`;
    }
}
