import { Notice } from 'obsidian';
import { clearUIDsInFolder } from '../../../uid/bulk';
import type { UidContext } from '../../../uid/context';

/**
 * The vault pass this section can start, and the auto-generation dance around
 * it. The section draws the controls and confirms the intent; this runs the
 * pass, handles its failure and says what happened.
 */

const ERROR_NOTICE_MS = 5000;
const AUTO_GEN_NOTICE_MS = 8000;

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
