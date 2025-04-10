import { App, TFile, Notice, FrontMatterCache } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import UIDGenerator from './main'; 

/**
 * Generates a unique ID using the UUID v4 standard.
 */
export function generateUID(): string {
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
            // Determine action based on initial state and overwrite flag
            const action = initialUidExists && overwrite ? 'Overwrote' : 'Set';
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
	const key = plugin.settings.uidKey;
	try {
		await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (frontmatter.hasOwnProperty(key)) {
				uidWasPresent = true;
				delete frontmatter[key];
			}
		});
		if (uidWasPresent) {
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