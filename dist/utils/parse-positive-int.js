import { InvalidArgumentError } from 'commander';
export function parsePositiveInt(value) {
    const parsed = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new InvalidArgumentError('Must be a positive integer.');
    }
    return parsed;
}
