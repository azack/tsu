import { execSync } from 'node:child_process';
export function getTsuOnPath() {
    let path = null;
    let version = null;
    try {
        path = execSync('which tsu', { encoding: 'utf-8', stdio: 'pipe' }).trim() || null;
    }
    catch {
    }
    try {
        version = execSync('tsu --version', { encoding: 'utf-8', stdio: 'pipe' }).trim() || null;
    }
    catch {
    }
    return { path, version };
}
