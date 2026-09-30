import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';
import { parsePositiveInt } from './parse-positive-int.js';

describe('parsePositiveInt', () => {
  it('should return the number for a positive integer', () => {
    expect(parsePositiveInt('20000')).toBe(20000);
    expect(parsePositiveInt('1')).toBe(1);
    expect(parsePositiveInt('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each(['abc', '-1', '0', '10ms', '1.5', '', '9007199254740993', '9'.repeat(400)])(
    'should reject %j',
    (value) => {
      expect(() => parsePositiveInt(value)).toThrow(InvalidArgumentError);
    }
  );
});
