import { InvalidArgumentError } from 'commander';

/**
 * Commander argument parser that accepts only a positive whole number.
 * Rejects values like `abc`, `-1`, `0` and `10ms` instead of letting parseInt coerce them,
 * and digit strings too large to represent exactly.
 */
export function parsePositiveInt(value: string): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('Must be a positive integer.');
  }
  return parsed;
}
