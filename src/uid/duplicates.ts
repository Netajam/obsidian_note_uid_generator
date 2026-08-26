import { TFile } from 'obsidian';
import type { UidStore } from './context';
import { renewUid } from './noteUid/noteUid';
import { getUIDFromFile } from './storage/frontmatter';

/**
 * Duplicate uids: finding the notes that share one, and giving all but one of
 * them a fresh uid.
 *
 * Collision detection stops a *generated* uid from repeating one the vault
 * already holds. It cannot stop a uid that arrives with the note — a copy, a
 * sync, a note made from a template — because such a uid was never generated
 * here, so nothing ever checked it. That is how duplicates actually happen,
 * and it is what this covers.
 *
 * The vault-wide scan asks the notes rather than the index, so what it reports
 * is what the frontmatter says now and not what the plugin last saw.
 */

/** One uid and every note carrying it. */
export interface DuplicateUidGroup {
	uid: string;
	/** Two or more notes, oldest first — the order that makes "keep the original" mean something. */
	notes: TFile[];
}

/** Every note that has a uid, gathered under it. Groups of one are the normal case. */
function notesByUid(ctx: UidStore): Map<string, TFile[]> {
	const byUid = new Map<string, TFile[]>();

	for (const note of ctx.app.vault.getMarkdownFiles()) {
		const uid = getUIDFromFile(ctx, note);
		if (!uid) continue;

		const sharing = byUid.get(uid);
		if (sharing) sharing.push(note);
		else byUid.set(uid, [note]);
	}
	return byUid;
}

/** Oldest first, so the note a copy was taken from leads its group. */
function byCreationTime(a: TFile, b: TFile): number {
	return (a.stat?.ctime ?? 0) - (b.stat?.ctime ?? 0);
}

/**
 * Every uid that more than one note carries, with those notes.
 *
 * Reads the whole vault, so it is a deliberate action rather than something to
 * run on every keystroke.
 */
export function findDuplicateUids(ctx: UidStore): DuplicateUidGroup[] {
	const duplicates: DuplicateUidGroup[] = [];

	for (const [uid, notes] of notesByUid(ctx)) {
		if (notes.length > 1) duplicates.push({ uid, notes: [...notes].sort(byCreationTime) });
	}
	return duplicates.sort((a, b) => a.uid.localeCompare(b.uid));
}

/**
 * The paths of the other notes already carrying this note's uid — empty when
 * it is unique, and when it has no uid at all.
 *
 * Answered from the index rather than the vault: this runs off a vault event,
 * where a full scan would be far too much work for one note.
 */
export function notesSharingUidWith(ctx: UidStore, file: TFile): string[] {
	const uid = getUIDFromFile(ctx, file);
	if (!uid) return [];

	return ctx.uidIndex.owners(uid).filter(path => path !== file.path);
}

/**
 * Gives each of `notes` a fresh uid.
 *
 * Renewing rather than clearing is the point: a note that loses its uid has no
 * identity at all, which is worse than sharing one.
 *
 * Takes the notes to renew rather than a group and the one to keep, because
 * the caller resolves a group from either end — naming the note that keeps the
 * uid, or naming a note that should give it up — and both come down to the
 * same list.
 *
 * @returns The notes that actually got one. A note missing from the result had
 * its write fail, and `renewUid` has already reported that.
 */
export async function renewUids(ctx: UidStore, notes: TFile[]): Promise<TFile[]> {
	const renewed: TFile[] = [];
	for (const note of notes) {
		if (await renewUid(ctx, note)) renewed.push(note);
	}
	return renewed;
}
