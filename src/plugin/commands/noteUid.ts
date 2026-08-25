import { Notice, TFile } from 'obsidian';
import { UidContext } from '../../uid/model/context';
import { generateUID } from '../../uid/generate';
import { getUIDFromFile, removeUID, setUID } from '../../uid/storage/frontmatter';
import { getActiveFile } from './activeFile';

/** Single-note uid actions, all driven from the active markdown view. */

const NO_ACTIVE_FILE = 'No active markdown file selected.';

/** Generate/update command — writes a fresh uid over whatever is there. */
export async function handleGenerateUpdateUid(ctx: UidContext, overwrite: true): Promise<void> {
	const file = getActiveFile(ctx);
	if (!file) {
		new Notice(NO_ACTIVE_FILE);
		return;
	}

	const wasSet = await setUID(ctx, file, generateUID(ctx), overwrite);
	if (wasSet) {
		new Notice(`${ctx.settings.uidKey} ${overwrite ? 'updated/set' : 'set'} for ${file.basename}`);
	} else if (!overwrite && getUIDFromFile(ctx, file)) {
		new Notice(`Note ${file.basename} already has a ${ctx.settings.uidKey}. Use "Generate/Update" command to overwrite.`);
	}
	// Otherwise setUID already reported the failure.
}

/** Ribbon icon and "create if missing" command — never overwrites. */
export async function handleCreateUidIfMissing(ctx: UidContext): Promise<void> {
	const file = getActiveFile(ctx);
	if (!file) {
		new Notice(NO_ACTIVE_FILE);
		return;
	}

	if (getUIDFromFile(ctx, file)) {
		new Notice(`Note ${file.basename} already has a ${ctx.settings.uidKey}.`);
		return;
	}

	if (await setUID(ctx, file, generateUID(ctx), false)) {
		new Notice(`${ctx.settings.uidKey} created for ${file.basename}`);
	}
}

/** Remove-uid command. */
export async function handleRemoveUid(ctx: UidContext): Promise<void> {
	const file: TFile | null = getActiveFile(ctx);
	if (!file) {
		new Notice('No active markdown file to remove uid from.');
		return;
	}

	if (await removeUID(ctx, file)) {
		new Notice(`${ctx.settings.uidKey} removed from ${file.basename}`);
	} else if (!getUIDFromFile(ctx, file)) {
		// removeUID reports its own errors; this only covers "there was nothing to remove".
		new Notice(`No ${ctx.settings.uidKey} found on ${file.basename}.`);
	}
}
