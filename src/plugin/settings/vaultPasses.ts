import { Notice } from 'obsidian';
import { addMissingUidsInScope, clearUIDsInFolder } from '../../uid/bulk';
import type { UidContext } from '../../uid/model/context';

/**
 * The two long-running vault passes the settings tab can start.
 *
 * The sections draw the buttons; this runs the pass, handles its failure and
 * says what happened. Splitting the two apart is also what leaves this folder
 * reaching into the uid domain from a leaf rather than from the middle of its
 * own tree — a section that both draws a control and drives a vault-wide pass
 * is doing two jobs.
 */

const ERROR_NOTICE_MS = 5000;
const AUTO_GEN_NOTICE_MS = 8000;

/** Gives every in-scope note that lacks one a uid. Reports its own failure. */
export async function backfillMissingUids(ctx: UidContext): Promise<void> {
	try {
		await addMissingUidsInScope(ctx);
	} catch (err) {
		console.error('[UIDGenerator] Error triggering bulk uid generation:', err);
		new Notice('Failed to start bulk generation. See console.', ERROR_NOTICE_MS);
	}
}

/**
 * Clears every uid under a folder with auto-generation switched off —
 * otherwise the notes it clears are handed a fresh uid the next time they
 * are opened.
 */
export async function clearFolderUids(ctx: UidContext, folderPath: string): Promise<void> {
	const autoGenWasOn = ctx.settings.autoGenerateUid;
	if (autoGenWasOn) {
		ctx.settings.autoGenerateUid = false;
		await ctx.saveSettings();
	}

	try {
		await clearUIDsInFolder(ctx, folderPath);
	} catch (err) {
		console.error('[UIDGenerator] Error during bulk uid clearing process:', err);
		new Notice('An unexpected error occurred during uid clearing. Check console.', ERROR_NOTICE_MS);
	} finally {
		if (autoGenWasOn) {
			// It stays off — say so rather than silently changing the user's setting back.
			new Notice('Automatic uid generation was disabled. You can re-enable it in settings if desired.', AUTO_GEN_NOTICE_MS);
		}
	}
}
