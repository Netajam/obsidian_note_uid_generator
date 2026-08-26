import { Notice, TFile, TFolder, normalizePath } from 'obsidian';
import type { UidStore } from './context';
import { clearUid, ensureUid } from './noteUid/noteUid';
import { getMarkdownFilesInFolder } from './folderNotes';

/** Vault-wide passes, driven from the settings tab. Both can run for a while, so both report progress. */

const PROGRESS_EVERY = 50;   // files between progress-notice updates
const YIELD_EVERY = 100;     // files between yields back to the UI thread
const SUMMARY_NOTICE_MS = 10000;

interface Tally {
	added: number;
	skippedExisting: number;
	skippedScope: number;
	errors: number;
}

/** Runs the shared missing-uid decision over one file and records the outcome. */
async function addUidIfMissing(ctx: UidStore, file: TFile, tally: Tally): Promise<void> {
	switch (await ensureUid(ctx, file)) {
		case 'added': tally.added++; break;
		case 'had-uid': tally.skippedExisting++; break;
		case 'out-of-scope': tally.skippedScope++; break;
		case 'error': tally.errors++; break;
	}
}

function summarize(tally: Tally): string {
	const summary = `Bulk uid generation complete:\n- Added: ${tally.added}`
		+ `\n- Skipped (already had uid): ${tally.skippedExisting}`
		+ `\n- Skipped (out of scope/excluded): ${tally.skippedScope}`;
	return tally.errors > 0 ? `${summary}\n- Errors: ${tally.errors} (see console)` : summary;
}

/**
 * Keeps a long pass honest with the user: refreshes the count on the notice
 * every so often, and hands the UI thread back often enough that a very large
 * vault does not freeze while the pass runs.
 */
async function betweenFiles(notice: Notice, header: string, done: number, total: number): Promise<void> {
	if (done === 0) return;
	if (done % PROGRESS_EVERY === 0) notice.setMessage(`${header}\n(${done}/${total})`);
	if (done % YIELD_EVERY === 0) await new Promise(resolve => setTimeout(resolve, 0));
}

/** Adds a uid to every in-scope note that lacks one. */
export async function addMissingUidsInScope(ctx: UidStore): Promise<void> {
	const files = ctx.app.vault.getMarkdownFiles();
	if (files.length === 0) {
		new Notice('No markdown files found in the vault.');
		return;
	}

	const tally: Tally = { added: 0, skippedExisting: 0, skippedScope: 0, errors: 0 };
	const header = `Processing ${files.length} files for missing UIDs...`;
	const notice = new Notice(header, 0); // 0 = stays up until we hide it

	try {
		for (let i = 0; i < files.length; i++) {
			await betweenFiles(notice, header, i, files.length);
			await addUidIfMissing(ctx, files[i], tally);
		}
	} finally {
		notice.hide();
		new Notice(summarize(tally), SUMMARY_NOTICE_MS + tally.errors * 100);
	}
}

/** Resolves a user-supplied path to a folder, saying in a notice why it could not. */
function resolveFolder(ctx: UidStore, folderPath: string): TFolder | null {
	const normalizedFolderPath = normalizePath(folderPath);
	if (!normalizedFolderPath) {
		new Notice('Folder path empty.');
		return null;
	}

	const folder = ctx.app.vault.getAbstractFileByPath(normalizedFolderPath);
	if (!(folder instanceof TFolder)) {
		new Notice(`Folder not found or path is not a folder: ${folderPath}`);
		return null;
	}
	return folder;
}

/** Clears every file it is given, counting what came off and what threw. */
async function clearUids(ctx: UidStore, files: TFile[]): Promise<{ cleared: number; errors: number }> {
	let cleared = 0;
	let errors = 0;
	for (const file of files) {
		try {
			if (await clearUid(ctx, file)) cleared++;
		} catch {
			errors++;
		}
	}
	return { cleared, errors };
}

/** Removes the uid from every note under `folderPath`. */
export async function clearUIDsInFolder(ctx: UidStore, folderPath: string): Promise<void> {
	const folder = resolveFolder(ctx, folderPath);
	if (!folder) return;

	new Notice(`Clearing ${ctx.settings.uidKey}s in "${folder.name}"... This may take a moment.`);

	const files = getMarkdownFilesInFolder(ctx.app, folder);
	if (files.length === 0) {
		new Notice(`No markdown files found within "${folder.name}".`);
		return;
	}

	const { cleared, errors } = await clearUids(ctx, files);

	let message = `UID clearing complete for "${folder.name}". Removed ${cleared} ${ctx.settings.uidKey}s.`;
	if (errors > 0) {
		message += ` Encountered ${errors} errors (check console).`;
	}
	new Notice(message, SUMMARY_NOTICE_MS);
}
