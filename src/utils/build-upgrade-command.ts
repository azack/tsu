/**
 * Validates a GitHub owner or repo name.
 * GitHub names can contain alphanumeric characters, hyphens, and underscores.
 * They cannot start with a hyphen or contain shell metacharacters.
 */
function isValidGitHubName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
}

/**
 * Builds the global install command for a package manager.
 *
 * When a tag is given, every package manager installs that release's tag, so
 * they all install the same code. npm installs the tag's tarball rather than a
 * `github:` spec, because `npm install -g github:<owner>/<repo>` leaves the global
 * package as a symlink into npm's temporary git-clone directory (no working bin), and
 * the next install fails with ENOTDIR.
 *
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @param packageManager - Package manager to use
 * @param tag - Release tag to install, exactly as GitHub names it (e.g. 'v0.29.0')
 * @returns The shell command to run
 * @throws Error if owner, repo, or tag contain invalid characters
 */
export function buildUpgradeCommand(
  owner: string,
  repo: string,
  packageManager: 'npm' | 'pnpm' | 'yarn',
  tag?: string
): string {
  // Validate inputs to prevent command injection
  if (!isValidGitHubName(owner)) {
    throw new Error(
      `Invalid GitHub owner: "${owner}". Must be alphanumeric with hyphens/underscores.`
    );
  }
  if (!isValidGitHubName(repo)) {
    throw new Error(
      `Invalid GitHub repo: "${repo}". Must be alphanumeric with hyphens/underscores.`
    );
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
