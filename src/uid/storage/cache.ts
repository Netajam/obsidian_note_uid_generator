import { TFile } from 'obsidian';
import type { UidContext } from '../model/context';
import { getUIDFromFile } from './frontmatter';

/**
 * The uid cache mirrors the vault so uid generation can detect collisions
 * without re-reading metadata. These helpers are the only writers besides
 * `setUID`/`removeUID`, and they keep `uidCache` and `uidPathMap` in step.
 */

/** Rebuilds the cache from scratch — on layout ready, and whenever the uid key changes. */
export function buildUidCache(ctx: UidContext): void {
	ctx.uidCache.clear();
	ctx.uidPathMap.clear();
	for (const file of ctx.app.vault.getMarkdownFiles()) {
		const uid = getUIDFromFile(ctx, file);
		if (uid) {
			ctx.uidCache.add(uid);
			ctx.uidPathMap.set(file.path, uid);
		}
	}
}

/**
 * Reconciles one file's cache entry with its current frontmatter — for files
 * created or synced in with a uid already set, and for frontmatter edited by
 * the user or another plugin.
 */
export function syncUidFromFrontmatter(ctx: UidContext, file: TFile): void {
	const oldUid = ctx.uidPathMap.get(file.path);
	const newUid = getUIDFromFile(ctx, file);
	if (oldUid === newUid) return;

	if (oldUid) ctx.uidCache.delete(oldUid);
	if (newUid) {
		ctx.uidCache.add(newUid);
		ctx.uidPathMap.set(file.path, newUid);
	} else {
		ctx.uidPathMap.delete(file.path);
	}
}

/** Evicts a deleted file. Uses the path map because its metadata may already be gone. */
export function forgetFile(ctx: UidContext, path: string): void {
	const uid = ctx.uidPathMap.get(path);
	if (!uid) return;
	ctx.uidCache.delete(uid);
	ctx.uidPathMap.delete(path);
}
