import { TFile, Notice } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import { customAlphabet } from 'nanoid';
import { ulid } from 'ulid';
import UIDGenerator from './main';

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
 * Generates a unique ID using UUID v4 or NanoID based on settings.
 * @param plugin The UIDGenerator plugin instance (for settings).
 */
const MAX_COLLISION_RETRIES = 10;

export function generateUID(plugin: UIDGenerator): string {
	for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
		const id = generateRawUID(plugin);
		if (!plugin.uidCache.has(id)) {
			return id;
		}
		console.warn(`[UIDGenerator] Collision detected, retrying (${attempt + 1}/${MAX_COLLISION_RETRIES})`);
	}
	// All retries exhausted — notify the user and return the duplicate as last resort
	const fallback = generateRawUID(plugin);
	const { nanoidAlphabet, nanoidLength } = plugin.settings;
	const totalCombinations = Math.pow(nanoidAlphabet.length, nanoidLength);
	const combinationsStr = totalCombinations > 1e15
		? totalCombinations.toExponential(2)
		: totalCombinations.toLocaleString();
	console.error(`[UIDGenerator] Failed to generate unique ID after ${MAX_COLLISION_RETRIES} attempts.`);
	new Notice(
		`Warning: Could not generate a unique ${plugin.settings.uidKey} after ${MAX_COLLISION_RETRIES} attempts. ` +
		`Current settings allow ~${combinationsStr} combinations (alphabet: ${nanoidAlphabet.length} chars, length: ${nanoidLength}). ` +
		`Consider increasing NanoID length or alphabet size.`,
		15000
	);
	return fallback;
}

function generateRawUID(plugin: UIDGenerator): string {
	if (plugin.settings.uidGenerator === 'nanoid') {
		const { nanoidAlphabet, nanoidLength, nanoidSeparators } = plugin.settings;
		const nanoid = getNanoidGenerator(nanoidAlphabet, nanoidLength);
		let id = nanoid();

		if (nanoidSeparators && nanoidSeparators.length > 0) {
			const insertions = nanoidSeparators
				.filter(s => s.char && s.char.length === 1)
				.map(s => {
					let pos = s.position;
					if (pos < 0) {
						pos = nanoidLength + pos;
					}
					pos = Math.max(0, Math.min(nanoidLength, pos));
					return { char: s.char, position: pos };
				})
				.sort((a, b) => b.position - a.position);

			for (const { char, position } of insertions) {
				id = id.slice(0, position) + char + id.slice(position);
			}
		}

		return id;
	}
	if (plugin.settings.uidGenerator === 'ulid') {
		return ulid();
	}
	return uuidv4();
}

/**
 * Retrieves the UID for a given file, respecting the custom key setting.
 * @param plugin The UIDGenerator plugin instance.
 * @param file The TFile to check.
 * @returns The UID string or null if not found or on error.
 */
export function getUIDFromFile(plugin: UIDGenerator, file: TFile | null): string | null {
	if (!file) return null;
	try {
		const cache = plugin.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) {
			return null;
		}
		const uidValue = frontmatter[plugin.settings.uidKey];
		// Ensure it's treated as a string, even if stored as number in YAML
		return typeof uidValue === 'string' || typeof uidValue === 'number' ? String(uidValue) : null;
	} catch (error) {
		console.error(`[UIDGenerator] Error reading metadata for ${file.path}:`, error);
		return null;
	}
}

/**
 * Sets or updates the UID property in a file's frontmatter.
 * @param plugin The UIDGenerator plugin instance.
 * @param file The TFile to modify.
 * @param uid The UID string to set.
 * @param overwrite If true, will overwrite an existing UID. If false (default), will only set if missing.
 * @returns Promise<boolean> - True if UID was set/modified, False otherwise.
 */
export async function setUID(plugin: UIDGenerator, file: TFile, uid: string, overwrite: boolean = false): Promise<boolean> {
	if (!file || !(file instanceof TFile) || file.extension !== 'md') {
		return false;
	}
	if (!uid) {
		console.warn(`[UIDGenerator] Attempted to set an empty UID for ${file.path}. Aborting.`);
		return false;
	}

	let uidWasSetOrOverwritten = false;
	const key = plugin.settings.uidKey;
	let initialUidExists = false; // Keep track if UID existed before processing

	try {
		await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const currentUid = frontmatter[key];
			initialUidExists = currentUid !== undefined && currentUid !== null && currentUid !== ''; // Check before potential modification

			if (initialUidExists && !overwrite) {
				uidWasSetOrOverwritten = false; // Explicitly false
				return; // Exit processor
			}

			// Only set the flag if the value actually changes or is newly set
			if (frontmatter[key] !== uid) {
				frontmatter[key] = uid;
				uidWasSetOrOverwritten = true;
			} else {
				// If overwrite is true but value is the same, we didn't *really* change it
				uidWasSetOrOverwritten = false;
			}


			// Optional cleanup
			if (key !== 'uid' && frontmatter.hasOwnProperty('uid')) delete frontmatter.uid;
			if (key !== 'Uid' && frontmatter.hasOwnProperty('Uid')) delete frontmatter.Uid;
			if (key !== 'UID' && frontmatter.hasOwnProperty('UID')) delete frontmatter.UID;
		});

		if (uidWasSetOrOverwritten) {
			plugin.uidCache.add(uid);
			plugin.uidPathMap.set(file.path, uid);
		}
		return uidWasSetOrOverwritten;

	} catch (error) {
		console.error(`[UIDGenerator] Error processing frontmatter for ${file.path} during setUID:`, error);
		new Notice(`Error setting ${key}. Check console.`, 5000);
		return false; // Indicate failure
	}
}

/**
 * Removes the UID property from a file's frontmatter, respecting the custom key.
 * @param plugin The UIDGenerator plugin instance.
 * @param file The TFile to modify.
 * @returns Promise<boolean> - True if a UID was found and removed, false otherwise.
 */
export async function removeUID(plugin: UIDGenerator, file: TFile): Promise<boolean> {
	if (!file || !(file instanceof TFile)) return false;
	let uidWasPresent = false;
	let removedUid: string | null = null;
	const key = plugin.settings.uidKey;
	try {
		await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (frontmatter.hasOwnProperty(key)) {
				removedUid = String(frontmatter[key]);
				uidWasPresent = true;
				delete frontmatter[key];
			}
		});
		if (uidWasPresent && removedUid) {
			plugin.uidCache.delete(removedUid);
			plugin.uidPathMap.delete(file.path);
		}
		return uidWasPresent;
	} catch (error) {
		console.error(`[UIDGenerator] Error processing frontmatter for ${file.path} during removal:`, error);
		new Notice(`Error removing ${key}. Check console.`, 5000);
		return false; // Indicate failure
	}
}

/**
 * Formats a string based on template and available data.
 * @param plugin The UIDGenerator plugin instance (needed for settings).
 * @param formatString The template string with placeholders {title}, {uid}, {uidKey}.
 * @param title The note title.
 * @param uid The actual UID value (or null/undefined if missing).
 * @returns The formatted string.
 */
export function formatCopyString(plugin: UIDGenerator, formatString: string, title: string, uid: string | null | undefined): string {
	let result = formatString;
	const uidKey = plugin.settings.uidKey;
	result = result.replace(/{title}/g, title || '');
	result = result.replace(/{uidKey}/g, uidKey || '');
	result = result.replace(/{uid}/g, uid || '');
	return result;
}
