import { TFile } from 'obsidian';
import type { UidContext } from './model/context';
import { generateUID } from './generate';
import { getUIDFromFile, setUID } from './storage/frontmatter';
import { isInAutoGenerationScope } from './scope';

/**
 * The "give this note a uid if it should have one" decision, in one place.
 *
 * Two callers ask it: auto-generation, one file at a time off a vault event,
 * and the bulk backfill, over every note in the vault. They must decide
 * identically — otherwise the "Generate missing uids now" button and
 * automatic generation disagree about which notes are in scope.
 *
 * Whether generation is switched on at all is the caller's question, not this
 * one's: the bulk pass runs on demand regardless of the auto-generate toggle.
 */

/** What `ensureUid` did with a note. */
export type EnsureUidOutcome =
	/** A new uid was written. */
	| 'added'
	/** The note already carried a uid; nothing was written. */
	| 'had-uid'
	/** Scope or exclusion settings rule this note out. */
	| 'out-of-scope'
	/** The write failed. `setUID` has already reported it to the user. */
	| 'error';

/** Adds a uid to `file` unless it is out of scope or already has one. */
export async function ensureUid(ctx: UidContext, file: TFile): Promise<EnsureUidOutcome> {
	if (!isInAutoGenerationScope(ctx.settings, file)) return 'out-of-scope';
	if (getUIDFromFile(ctx, file)) return 'had-uid';

	try {
		// setUID reports its own failures via a Notice; just classify them here.
		return await setUID(ctx, file, generateUID(ctx), false) ? 'added' : 'error';
	} catch (err) {
		console.error(`[UIDGenerator] Unexpected error setting uid for ${file.path}:`, err);
		return 'error';
	}
}
