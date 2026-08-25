import { Notice, TFile } from 'obsidian';
import { UidContext } from '../model/context';
import { isMarkdownNote } from '../model/note';

const ERROR_NOTICE_MS = 5000;

/** Legacy/casing variants cleaned up when they are not the configured key. */
const ALTERNATE_UID_KEYS = ['uid', 'Uid', 'UID'];

/**
 * Retrieves the UID for a given file, respecting the custom key setting.
 * Returns null if the file has no frontmatter, no uid, or could not be read.
 */
export function getUIDFromFile(ctx: UidContext, file: TFile | null): string | null {
	if (!file) return null;
	try {
		const frontmatter = ctx.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) return null;

		const uidValue = frontmatter[ctx.settings.uidKey];
		// Ensure it's treated as a string, even if stored as number in YAML
		return typeof uidValue === 'string' || typeof uidValue === 'number' ? String(uidValue) : null;
	} catch (error) {
		console.error(`[UIDGenerator] Error reading metadata for ${file.path}:`, error);
		return null;
	}
}

function dropAlternateKeys(frontmatter: Record<string, unknown>, key: string): void {
	for (const alternate of ALTERNATE_UID_KEYS) {
		if (alternate !== key && Object.prototype.hasOwnProperty.call(frontmatter, alternate)) {
			delete frontmatter[alternate];
		}
	}
}

/**
 * Sets or updates the UID property in a file's frontmatter.
 * @param overwrite If true, replaces an existing UID. If false, only sets a missing one.
 * @returns True if the UID was written, false if it was left untouched or the write failed.
 */
export async function setUID(ctx: UidContext, file: TFile, uid: string, overwrite = false): Promise<boolean> {
	if (!isMarkdownNote(file)) {
		return false;
	}
	if (!uid) {
		console.warn(`[UIDGenerator] Attempted to set an empty UID for ${file.path}. Aborting.`);
		return false;
	}

	const key = ctx.settings.uidKey;
	let uidWasWritten = false;

	try {
		await ctx.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const currentUid = frontmatter[key];
			const uidExists = currentUid !== undefined && currentUid !== null && currentUid !== '';
			if (uidExists && !overwrite) return;

			// Only report a write when the value actually changes.
			uidWasWritten = currentUid !== uid;
			frontmatter[key] = uid;

			dropAlternateKeys(frontmatter, key);
		});

		if (uidWasWritten) {
			ctx.uidCache.add(uid);
			ctx.uidPathMap.set(file.path, uid);
		}
		return uidWasWritten;
	} catch (error) {
		console.error(`[UIDGenerator] Error processing frontmatter for ${file.path} during setUID:`, error);
		new Notice(`Error setting ${key}. Check console.`, ERROR_NOTICE_MS);
		return false;
	}
}

/**
 * Removes the UID property from a file's frontmatter, respecting the custom key.
 * @returns True if a UID was found and removed, false otherwise.
 */
export async function removeUID(ctx: UidContext, file: TFile): Promise<boolean> {
	if (!file || !(file instanceof TFile)) return false;

	const key = ctx.settings.uidKey;
	let uidWasPresent = false;
	let removedUid = '';

	try {
		await ctx.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
				removedUid = String(frontmatter[key]);
				uidWasPresent = true;
				delete frontmatter[key];
			}
		});
		if (uidWasPresent && removedUid) {
			ctx.uidCache.delete(removedUid);
			ctx.uidPathMap.delete(file.path);
		}
		return uidWasPresent;
	} catch (error) {
		console.error(`[UIDGenerator] Error processing frontmatter for ${file.path} during removal:`, error);
		new Notice(`Error removing ${key}. Check console.`, ERROR_NOTICE_MS);
		return false;
	}
}
