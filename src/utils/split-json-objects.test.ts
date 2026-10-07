import { describe, it, expect } from 'vitest';
import { splitJsonObjects } from './split-json-objects.js';

describe('splitJsonObjects', () => {
  it('should return each object in order, ignoring the text around them', () => {
    const output = [
      '⚙️ Merged config:',
      '{\n  "analysis-options-path": "/repo/features/analysis_options.yaml"\n}',
      'analyzing...',
      '{"analyzeResults":[{"path":"lib/a.dart","issues":[]}]}',
      '✖ total lint style issues - 1',
    ].join('\n');

    expect(splitJsonObjects(output)).toEqual([
      { 'analysis-options-path': '/repo/features/analysis_options.yaml' },
      { analyzeResults: [{ path: 'lib/a.dart', issues: [] }] },
    ]);
  });

  it('should keep braces and escaped quotes inside strings', () => {
    const output = 'note {not json}\n{"message":"use \\"{x}\\" here","nested":{"a":1}}';

    expect(splitJsonObjects(output)).toEqual([{ message: 'use "{x}" here', nested: { a: 1 } }]);
  });

  it('should return nothing for output without a complete object', () => {
    expect(splitJsonObjects('')).toEqual([]);
    expect(splitJsonObjects('analyzing... {"analyzeResults": [')).toEqual([]);
  });
});
