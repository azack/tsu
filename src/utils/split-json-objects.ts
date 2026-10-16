/**
 * Returns every top-level JSON object in `output`, in order, skipping any text around them.
 * DCM prints human-readable lines and, with `--print-config`, a config object per package
 * ahead of its `--reporter=json` result.
 */
export function splitJsonObjects(output: string): unknown[] {
  const objects: unknown[] = [];
  let start = output.indexOf('{');

  while (start !== -1) {
    const end = findObjectEnd(output, start);
    if (end !== -1) {
      try {
        objects.push(JSON.parse(output.slice(start, end + 1)));
        start = output.indexOf('{', end + 1);
        continue;
      } catch {
        // Not JSON after all; look for the next object from the following character.
      }
    }
    start = output.indexOf('{', start + 1);
  }

  return objects;
}

function findObjectEnd(output: string, start: number): number {
  let depth = 0;
  let inString = false;

  for (let i = start; i < output.length; i++) {
    const character = output[i];
    if (inString) {
      if (character === '\\') {
        i++;
      } else if (character === '"') {
        inString = false;
      }
    } else if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth++;
    } else if (character === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}
