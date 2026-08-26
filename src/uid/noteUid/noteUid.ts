import { TFile } from 'obsidian';
import type { UidStore } from '../context';
import { generateUID } from '../generators/generate';
import { getUIDFromFile, removeUID, setUID } from '../storage/frontmatter';
import { isInAutoGenerationScope } from './scope';

/**
 * Everything that can be done to the uid of one note: read it, give the note
 * one if it should have one, replace it, remove it.
 *
 * This is the domain's answer to "what does a uid command do", and it is the
 * only place that knows a uid is generated and then written to frontmatter.
 * Callers — the command handlers above and the bulk passes beside — say what
 * they want done, never how; that is what keeps "generate then store" from
 * being reassembled slightly differently at each call site.
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

/** The note's current uid, or null when it has none. */
export function uidOf(ctx: UidStore, file: TFile | null): string | null {
	return getUIDFromFile(ctx, file);
}

/**
 * Adds a uid to `file` unless it is out of scope or already has one.
 *
 * Two callers ask it: auto-generation, one file at a time off a vault event,
 * and the bulk backfill, over every note in the vault. They must decide
 * identically — otherwise the "Generate missing uids now" button and
 * automatic generation disagree about which notes are in scope.
 *
 * Whether generation is switched on at all is the caller's question, not this
 * one's: the bulk pass runs on demand regardless of the auto-generate toggle.
 */
export async function ensureUid(ctx: UidStore, file: TFile): Promise<EnsureUidOutcome> {
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

/**
 * Writes a fresh uid over whatever the note carries. Ignores scope: this only
 * runs when the user asks for it on a note they have open.
 *
 * @returns True when a new uid was written; false when the write failed, in
 * which case it has already been reported.
 */
export function renewUid(ctx: UidStore, file: TFile): Promise<boolean> {
	return setUID(ctx, file, generateUID(ctx), true);
}

/**
 * Gives the note a uid only if it has none. Ignores scope, unlike `ensureUid`:
 * this runs when the user asks for it on a note they have open, and asking is
 * the decision.
 *
 * @returns True when a uid was written.
 */
export function createUidIfMissing(ctx: UidStore, file: TFile): Promise<boolean> {
	return setUID(ctx, file, generateUID(ctx), false);
}

/** Removes the note's uid. @returns True when there was one to remove. */
export function clearUid(ctx: UidStore, file: TFile): Promise<boolean> {
	return removeUID(ctx, file);
}
