import { Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { UidContext } from './model/context';
import { ensureUid } from './assign';
import { removeUID } from './storage/frontmatter';
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
async function addUidIfMissing(ctx: UidContext, file: TFile, tally: Tally): Promise<void> {
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

/** Adds a uid to every in-scope note that lacks one. */
export async function addMissingUidsInScope(ctx: UidContext): Promise<void> {
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
			if (i > 0 && i % PROGRESS_EVERY === 0) {
				notice.setMessage(`${header}\n(${i}/${files.length})`);
			}
			await addUidIfMissing(ctx, files[i], tally);
			if (i > 0 && i % YIELD_EVERY === 0) {
				// Yield so a very large vault doesn't freeze the UI.
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}
	} finally {
		notice.hide();
		new Notice(summarize(tally), SUMMARY_NOTICE_MS + tally.errors * 100);
	}
}

/** Removes the uid from every note under `folderPath`. */
export async function clearUIDsInFolder(ctx: UidContext, folderPath: string): Promise<void> {
	const normalizedFolderPath = normalizePath(folderPath);
	if (!normalizedFolderPath) {
		new Notice('Folder path empty.');
		return;
	}

	const folder = ctx.app.vault.getAbstractFileByPath(normalizedFolderPath);
	if (!(folder instanceof TFolder)) {
		new Notice(`Folder not found or path is not a folder: ${folderPath}`);
		return;
	}

	new Notice(`Clearing ${ctx.settings.uidKey}s in "${folder.name}"... This may take a moment.`);

	const files = getMarkdownFilesInFolder(ctx.app, folder);
	if (files.length === 0) {
		new Notice(`No markdown files found within "${folder.name}".`);
		return;
	}

	let clearedCount = 0;
	let errorCount = 0;
	for (const file of files) {
		try {
			if (await removeUID(ctx, file)) clearedCount++;
		} catch {
			errorCount++;
		}
	}

	let message = `UID clearing complete for "${folder.name}". Removed ${clearedCount} ${ctx.settings.uidKey}s.`;
	if (errorCount > 0) {
		message += ` Encountered ${errorCount} errors (check console).`;
	}
	new Notice(message, SUMMARY_NOTICE_MS);
}
