export function packageManagerFromPaths(paths) {
    const matches = (needles) => paths.some((path) => needles.some((needle) => path.includes(needle)));
    if (matches(['/Library/pnpm/', '/.local/share/pnpm/'])) {
        return 'pnpm';
    }
    if (matches(['/.yarn/', '/Yarn/', '/.config/yarn/'])) {
        return 'yarn';
    }
    if (matches(['/lib/node_modules/', '/.npm/'])) {
        return 'npm';
    }
    return null;
}
