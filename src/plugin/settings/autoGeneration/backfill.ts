import { Notice } from 'obsidian';
import { addMissingUidsInScope } from '../../../uid/bulk';
import type { UidContext } from '../../../uid/context';

/**
 * The one-off "catch up the whole vault" pass this section can start.
 *
 * The section draws the button; this runs the pass, handles its failure and
 * says what happened. Splitting the two apart is also what leaves this folder
 * reaching into the uid domain from a leaf rather than from the middle of its
 * own tree — a section that both draws a control and drives a vault-wide pass
 * is doing two jobs.
 */

const ERROR_NOTICE_MS = 5000;

/** Gives every in-scope note that lacks one a uid. Reports its own failure. */
export async function backfillMissingUids(ctx: UidContext): Promise<void> {
	try {
		await addMissingUidsInScope(ctx);
	} catch (err) {
		console.error('[UIDGenerator] Error triggering bulk uid generation:', err);
		new Notice('Failed to start bulk generation. See console.', ERROR_NOTICE_MS);
	}
}
