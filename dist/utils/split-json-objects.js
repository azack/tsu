export function splitJsonObjects(output) {
    const objects = [];
    let start = output.indexOf('{');
    while (start !== -1) {
        const end = findObjectEnd(output, start);
        if (end !== -1) {
            try {
                objects.push(JSON.parse(output.slice(start, end + 1)));
                start = output.indexOf('{', end + 1);
                continue;
            }
            catch {
            }
        }
        start = output.indexOf('{', start + 1);
    }
    return objects;
}
function findObjectEnd(output, start) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < output.length; i++) {
        const character = output[i];
        if (inString) {
            if (character === '\\') {
                i++;
            }
            else if (character === '"') {
                inString = false;
            }
        }
        else if (character === '"') {
            inString = true;
        }
        else if (character === '{') {
            depth++;
        }
        else if (character === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}
