const REGEXP_SPECIAL_CHARACTERS = new Set(['\\', '^', '$', '+', '.', '(', ')', '|']);
const NEVER_MATCHES = /(?!)/;

/**
 * Converts a path glob, as written in analysis_options.yaml excludes, to an anchored RegExp.
 * Supports `*` (within one path segment), `**` (any number of segments), `?` and `{a,b}`.
 * A glob with a character class (`[...]`) matches nothing, so callers that use it to drop
 * findings keep them instead of guessing. Any other character matches itself.
 */
export function globToRegExp(glob: string): RegExp {
  if (glob.includes('[') || glob.includes(']')) {
    return NEVER_MATCHES;
  }

  let source = '';
  let braceDepth = 0;

  for (let i = 0; i < glob.length; i++) {
    const character = glob[i] ?? '';

    if (character === '*' && glob[i + 1] === '*') {
      const startsSegment = i === 0 || glob[i - 1] === '/';
      if (startsSegment && glob[i + 2] === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else {
        source += '.*';
        i += 1;
      }
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else if (character === '{') {
      braceDepth++;
      source += '(?:';
    } else if (character === '}' && braceDepth > 0) {
      braceDepth--;
      source += ')';
    } else if (character === ',' && braceDepth > 0) {
      source += '|';
    } else if (REGEXP_SPECIAL_CHARACTERS.has(character)) {
      source += `\\${character}`;
    } else {
      source += character;
    }
  }

  return new RegExp(`^${source}$`);
}
