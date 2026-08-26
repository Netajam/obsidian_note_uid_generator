import { Notice, TFile } from 'obsidian';
import type { UidContext } from '../../uid/context';
import { notesSharingUidWith } from '../../uid/duplicates';
import { renewUid } from '../../uid/noteUid/noteUid';

/**
 * Vault event handler: catches a note that turns up carrying a uid another
 * note already has.
 *
 * This is the gap collision detection cannot cover. A generated uid is checked
 * against the whole vault before it is written; a uid that arrives *with* the
 * note — copied, synced, pasted in from a template — was never generated here,
 * so nothing ever checked it. Copying a note and forgetting to renew its uid
 * is the ordinary way a vault ends up with two of them.
 *
 * What to do about it is the user's choice, because neither answer is free: a
 * notice interrupts, and renewing rewrites a note the user did not ask to have
 * rewritten.
 */

const DUPLICATE_NOTICE_MS = 10000;

/** Names the offending company: one path if there is one, a count if there are more. */
function describeSharers(paths: string[]): string {
	return paths.length === 1 ? `"${paths[0]}"` : `${paths.length} other notes`;
}

/**
 * Reports — or repairs — a note whose uid is not its own.
 *
 * Only ever called for notes that were just created, so "regenerate" renews
 * the newcomer and leaves the note it was copied from alone. That matters:
 * the original is the one anything outside the vault is already pointing at.
 */
export async function handleDuplicateUidCheck(ctx: UidContext, file: TFile): Promise<void> {
	const policy = ctx.settings.duplicateUidCheck;
	if (policy === 'off') return;

	const sharers = notesSharingUidWith(ctx, file);
	if (sharers.length === 0) return;

	const { uidKey } = ctx.settings;
	if (policy === 'notify') {
		new Notice(
			`Duplicate ${uidKey}: "${file.basename}" carries the same ${uidKey} as ${describeSharers(sharers)}.`,
			DUPLICATE_NOTICE_MS,
		);
		return;
	}

	if (await renewUid(ctx, file)) {
		new Notice(
			`"${file.basename}" arrived with a ${uidKey} already in use — a fresh one was generated.`,
			DUPLICATE_NOTICE_MS,
		);
	}
}
