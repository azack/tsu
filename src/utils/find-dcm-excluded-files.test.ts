import { describe, it, expect } from 'vitest';
import { findDcmExcludedFiles } from './find-dcm-excluded-files.js';

const printedConfig = (packageRoot: string, globalExcludes: string[]): string =>
  `⚙️ Merged config:\n${JSON.stringify(
    {
      'analysis-options-path': `${packageRoot}/analysis_options.yaml`,
      'global-excludes': globalExcludes,
      rules: [{ name: 'arguments-ordering', excludes: [] }],
    },
    null,
    2
  )}\n`;

const output = [
  printedConfig('/repo/features', ['/repo/features/**/*_test.dart', '/repo/features/test/**']),
  printedConfig('/repo/samba', ['/repo/samba/**/*.g.dart']),
  '{"formatVersion":13,"analyzeResults":[]}',
].join('\n');

describe('findDcmExcludedFiles', () => {
  it('should return the files their own package excludes', () => {
    const excluded = findDcmExcludedFiles(
      output,
      [
        'features/test/support/support.dart',
        'features/lib/menu_test.dart',
        'features/lib/menu.dart',
        'samba/lib/theme.g.dart',
        'samba/test/theme_test.dart',
      ],
      '/repo'
    );

    expect([...excluded]).toEqual([
      'features/test/support/support.dart',
      'features/lib/menu_test.dart',
      'samba/lib/theme.g.dart',
    ]);
  });

  it('should use the closest package when packages are nested', () => {
    const nested = [
      printedConfig('/repo', ['/repo/**/*.dart']),
      printedConfig('/repo/taconic', []),
    ].join('\n');

    expect([
      ...findDcmExcludedFiles(nested, ['taconic/lib/a.dart', 'tool/a.dart'], '/repo'),
    ]).toEqual(['tool/a.dart']);
  });

  it('should not exclude files outside every printed package', () => {
    expect(findDcmExcludedFiles(output, ['app/test/a_test.dart'], '/repo').size).toBe(0);
  });

  it('should not exclude anything without printed configs', () => {
    const resultOnly = '{"analyzeResults":[{"path":"features/test/a_test.dart","issues":[]}]}';

    expect(findDcmExcludedFiles(resultOnly, ['features/test/a_test.dart'], '/repo').size).toBe(0);
  });

  it('should not treat a sibling directory with a shared prefix as the package', () => {
    expect(findDcmExcludedFiles(output, ['features_extra/test/a_test.dart'], '/repo').size).toBe(0);
  });
});
