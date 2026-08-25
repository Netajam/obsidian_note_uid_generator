import { customAlphabet } from 'nanoid';

export interface NanoidSeparator {
	char: string;
	position: number;
}

// Cache the nanoid generator to avoid recreating on every call
let cachedNanoid: (() => string) | null = null;
let cachedAlphabet = '';
let cachedLength = 0;

function getNanoidGenerator(alphabet: string, length: number): () => string {
	if (cachedNanoid && cachedAlphabet === alphabet && cachedLength === length) {
		return cachedNanoid;
	}
	cachedAlphabet = alphabet;
	cachedLength = length;
	cachedNanoid = customAlphabet(alphabet, length);
	return cachedNanoid;
}

/**
 * Injects the configured separator characters into a raw id.
 *
 * Positions are indexes into the *raw* id; negative values count from the end.
 * Insertions are applied right-to-left so earlier positions stay valid.
 */
function applySeparators(id: string, length: number, separators: NanoidSeparator[]): string {
	const insertions = separators
		.filter(s => s.char && s.char.length === 1)
		.map(s => ({
			char: s.char,
			position: Math.max(0, Math.min(length, s.position < 0 ? length + s.position : s.position)),
		}))
		.sort((a, b) => b.position - a.position);

	let result = id;
	for (const { char, position } of insertions) {
		result = result.slice(0, position) + char + result.slice(position);
	}
	return result;
}

export function generateNanoID(alphabet: string, length: number, separators: NanoidSeparator[]): string {
	const id = getNanoidGenerator(alphabet, length)();
	return separators && separators.length > 0 ? applySeparators(id, length, separators) : id;
}
