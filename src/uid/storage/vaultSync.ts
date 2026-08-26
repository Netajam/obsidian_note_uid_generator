import { TAbstractFile } from 'obsidian';
import type { UidStore } from '../context';
import { getUIDFromFile } from './frontmatter';

/**
 * Keeps the uid index in step with the vault, so uid generation can detect
 * collisions — and duplicate detection can spot twins — without re-reading
 * every note's metadata. These helpers are the only writers besides
 * `setUID`/`removeUID`.
 */

/** Rebuilds the index from scratch — on layout ready, and whenever the uid key changes. */
export function buildUidIndex(ctx: UidStore): void {
	ctx.uidIndex.clear();
	for (const file of ctx.app.vault.getMarkdownFiles()) {
		const uid = getUIDFromFile(ctx, file);
		if (uid) ctx.uidIndex.set(file.path, uid);
	}
}

/**
 * Reconciles one file's index entry with its current frontmatter — for files
 * created or synced in with a uid already set, and for frontmatter edited by
 * the user or another plugin.
 *
 * Takes whatever the vault event carried: a vault entry that is not a note has
 * no uid to read and none indexed, so it falls out at the first comparison.
 */
export function syncUidFromFrontmatter(ctx: UidStore, file: TAbstractFile): void {
	const oldUid = ctx.uidIndex.uidAt(file.path);
	const newUid = getUIDFromFile(ctx, file);
	if (oldUid === newUid) return;

	if (newUid) ctx.uidIndex.set(file.path, newUid);
	else ctx.uidIndex.forget(file.path);
}

/** Evicts a deleted file. Goes by path, because its metadata may already be gone. */
export function forgetFile(ctx: UidStore, path: string): void {
	ctx.uidIndex.forget(path);
}
