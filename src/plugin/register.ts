import { Plugin } from 'obsidian';
import { buildUidCache, forgetFile, syncUidFromFrontmatter } from '../uid/storage/cache';
import { UidContext } from '../uid/model/context';
import { isMarkdownNote } from '../uid/model/note';
import { loadUidState } from './state';
import { registerUidCommands } from './commands/register';
import { UIDSettingTab } from './settings/SettingsTab';

/**
 * The composition root: it loads the plugin's state and hands it to each
 * surface. The commands wire themselves in — this file only names the door of
 * `./commands`, never the handlers behind it.
 */

/**
 * Keeps the uid cache in step with the vault. Deferred to layout-ready so the
 * cache is built from a fully indexed vault before anything reads it.
 */
function registerCacheMaintenance(host: Plugin, ctx: UidContext): void {
	host.app.workspace.onLayoutReady(() => {
		buildUidCache(ctx);

		// Files dropped or synced in may already carry a uid.
		host.registerEvent(host.app.vault.on('create', (file) => {
			if (isMarkdownNote(file)) syncUidFromFrontmatter(ctx, file);
		}));

		host.registerEvent(host.app.vault.on('delete', (file) => {
			if (isMarkdownNote(file)) forgetFile(ctx, file.path);
		}));

		// Frontmatter edited by the user or another plugin.
		host.registerEvent(host.app.metadataCache.on('changed', (file) => {
			if (isMarkdownNote(file)) syncUidFromFrontmatter(ctx, file);
		}));
	});
}

/** Loads the uid state and wires every surface into Obsidian. Called once, from `onload`. */
export async function startUidGenerator(host: Plugin): Promise<void> {
	const ctx = await loadUidState(host);

	// Registered first so the cache is built, and a created file is reconciled
	// against its frontmatter, before auto-generation looks at it.
	registerCacheMaintenance(host, ctx);
	registerUidCommands(host, ctx);
	host.addSettingTab(new UIDSettingTab(host, ctx));
}
