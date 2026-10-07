const REGEXP_SPECIAL_CHARACTERS = new Set(['\\', '^', '$', '+', '.', '(', ')', '|']);
const NEVER_MATCHES = /(?!)/;
export function globToRegExp(glob) {
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
            }
            else {
                source += '.*';
                i += 1;
            }
        }
        else if (character === '*') {
            source += '[^/]*';
        }
        else if (character === '?') {
            source += '[^/]';
        }
        else if (character === '{') {
            braceDepth++;
            source += '(?:';
        }
        else if (character === '}' && braceDepth > 0) {
            braceDepth--;
            source += ')';
        }
        else if (character === ',' && braceDepth > 0) {
            source += '|';
        }
        else if (REGEXP_SPECIAL_CHARACTERS.has(character)) {
            source += `\\${character}`;
        }
        else {
            source += character;
        }
    }
    return new RegExp(`^${source}$`);
}
