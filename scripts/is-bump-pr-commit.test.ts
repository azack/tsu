import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./is-bump-pr-commit.sh', import.meta.url));

describe('is-bump-pr-commit.sh', () => {
  let binDir: string;

  beforeEach(() => {
    binDir = mkdtempSync(join(tmpdir(), 'is-bump-pr-commit-'));
  });

  afterEach(() => {
    rmSync(binDir, { recursive: true, force: true });
  });

  const stubGh = (body: string) => {
    const gh = join(binDir, 'gh');
    writeFileSync(gh, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(gh, 0o755);
  };

  const run = () =>
    execFileSync('bash', [script, 'abc123', 'bestdan/tsu'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    }).trim();

  it('prints true for a commit from a merged bump PR', () => {
    stubGh("printf 'bump-version-next\\n'");
    expect(run()).toBe('true');
  });

  it('prints false for a commit from an ordinary PR', () => {
    stubGh("printf 'azack/version-bump-on-push\\n'");
    expect(run()).toBe('false');
  });

  it('prints false when only a non-prefix ref mentions the bump branch', () => {
    stubGh("printf 'docs/explain-bump-version-next\\n'");
    expect(run()).toBe('false');
  });

  it('prints false for a direct push with no merged PR', () => {
    stubGh('true');
    expect(run()).toBe('false');
  });

  it('fails instead of printing false when the API call fails', () => {
    stubGh('echo "HTTP 502" >&2; exit 1');
    expect(() => run()).toThrow();
  });
});
