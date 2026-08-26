import { Notice, TFile } from 'obsidian';
import type { UidContext } from '../../uid/context';
import { clearUid, createUidIfMissing, renewUid, uidOf } from '../../uid/noteUid/noteUid';

/**
 * Single-note uid actions: the notices around the four operations the uid
 * domain offers on one note.
 *
 * Each is handed the note it acts on rather than looking one up, which is what
 * keeps this file a leaf: it reaches into the uid domain and depends on no
 * sibling. What it asks for there is an operation — "renew this note's uid" —
 * never the generate-then-write recipe behind it.
 */

const NO_ACTIVE_FILE = 'No active markdown file selected.';

/** Generate/update command — writes a fresh uid over whatever is there. */
export async function handleGenerateUpdateUid(ctx: UidContext, file: TFile | null): Promise<void> {
	if (!file) {
		new Notice(NO_ACTIVE_FILE);
		return;
	}

	if (await renewUid(ctx, file)) {
		new Notice(`${ctx.settings.uidKey} updated/set for ${file.basename}`);
	}
	// Otherwise the write failed and has already been reported.
}

/** Ribbon icon and "create if missing" command — never overwrites. */
export async function handleCreateUidIfMissing(ctx: UidContext, file: TFile | null): Promise<void> {
	if (!file) {
		new Notice(NO_ACTIVE_FILE);
		return;
	}

	if (uidOf(ctx, file)) {
		new Notice(`Note ${file.basename} already has a ${ctx.settings.uidKey}.`);
		return;
	}

	if (await createUidIfMissing(ctx, file)) {
		new Notice(`${ctx.settings.uidKey} created for ${file.basename}`);
	}
}

/** Remove-uid command. */
export async function handleRemoveUid(ctx: UidContext, file: TFile | null): Promise<void> {
	if (!file) {
		new Notice('No active markdown file to remove uid from.');
		return;
	}

	if (await clearUid(ctx, file)) {
		new Notice(`${ctx.settings.uidKey} removed from ${file.basename}`);
	} else if (!uidOf(ctx, file)) {
		// The domain reports its own errors; this only covers "there was nothing to remove".
		new Notice(`No ${ctx.settings.uidKey} found on ${file.basename}.`);
	}
}
