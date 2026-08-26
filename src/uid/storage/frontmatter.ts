import { Notice, TAbstractFile, TFile } from 'obsidian';
import type { UidStore } from '../context';
import { isMarkdownNote } from './note';

const ERROR_NOTICE_MS = 5000;

/** Legacy/casing variants cleaned up when they are not the configured key. */
const ALTERNATE_UID_KEYS = ['uid', 'Uid', 'UID'];

/**
 * Retrieves the UID for a given file, respecting the custom key setting.
 *
 * Takes any vault entry and answers null for the ones that are not notes, so
 * that a caller holding whatever a vault event handed it — the uid cache, say
 * — asks the same question as one holding a note.
 *
 * Returns null if the file has no frontmatter, no uid, or could not be read.
 */
export function getUIDFromFile(ctx: UidStore, file: TAbstractFile | null): string | null {
	if (!isMarkdownNote(file)) return null;
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

/** YAML can hold a uid as a number, and an emptied field as `''` — neither of those is a uid. */
function hasUid(value: unknown): boolean {
	return value !== undefined && value !== null && value !== '';
}

/**
 * Applies the write to one file's frontmatter, leaving an existing uid alone
 * unless asked to overwrite it.
 *
 * @returns True when the stored value actually changed — writing the uid a
 * file already had is not a write worth reporting.
 */
function applyUid(frontmatter: Record<string, unknown>, key: string, uid: string, overwrite: boolean): boolean {
	const currentUid = frontmatter[key];
	if (hasUid(currentUid) && !overwrite) return false;

	frontmatter[key] = uid;
	dropAlternateKeys(frontmatter, key);
	return currentUid !== uid;
}

/**
 * Sets or updates the UID property in a file's frontmatter.
 * @param overwrite If true, replaces an existing UID. If false, only sets a missing one.
 * @returns True if the UID was written, false if it was left untouched or the write failed.
 */
export async function setUID(ctx: UidStore, file: TFile, uid: string, overwrite = false): Promise<boolean> {
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
			uidWasWritten = applyUid(frontmatter, key, uid, overwrite);
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
export async function removeUID(ctx: UidStore, file: TFile): Promise<boolean> {
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
