import {
	Editor, FileExplorerView, MarkdownView, Menu, Plugin, TAbstractFile, TFile, TFolder, WorkspaceLeaf, debounce,
} from 'obsidian';
import { buildUidCache, forgetFile, syncUidFromFrontmatter } from '../uid/storage/cache';
import { getUIDFromFile } from '../uid/storage/frontmatter';
import { UidContext } from '../uid/model/context';
import { loadUidState } from './state';
import { handleAutoGenerateUid } from './commands/autoGenerate';
import {
	handleCopyTitleUid, handleCopyTitlesAndUidsForMultipleFiles, handleCopyTitlesAndUidsForSelection,
	handleCopyTitlesAndUidsFromFolder, handleCopyUid,
} from './commands/copy';
import { handleCreateUidIfMissing, handleGenerateUpdateUid, handleRemoveUid } from './commands/noteUid';
import { UIDSettingTab } from './settings/SettingsTab';

/**
 * The one place where this plugin's features are wired into Obsidian.
 * `main.ts` calls `startUidGenerator`; nothing else here is public.
 */

// Debounced so a burst of create/open events (startup, vault sync) fires once.
// `leading: true` keeps the first event immediate. This is a global debounce:
// files created less than this apart may not all be handled. Per-file debouncing
// would need a timer per path — more state than the problem is worth.
const AUTO_GENERATE_DEBOUNCE_MS = 500;

function isMarkdown(file: TAbstractFile | null): file is TFile {
	return file instanceof TFile && file.extension === 'md';
}

function registerRibbon(host: Plugin, ctx: UidContext): void {
	host.addRibbonIcon('fingerprint', `Create ${ctx.settings.uidKey} if missing`, () => {
		handleCreateUidIfMissing(ctx);
	});
}

/** Keeps the uid cache in step with the vault, and auto-generates uids for new/opened notes. */
function registerVaultEvents(host: Plugin, ctx: UidContext): void {
	const autoGenerate = debounce(
		(file: TFile) => handleAutoGenerateUid(ctx, file),
		AUTO_GENERATE_DEBOUNCE_MS,
		true,
	);

	host.app.workspace.onLayoutReady(() => {
		buildUidCache(ctx);

		host.registerEvent(host.app.vault.on('create', (file) => {
			if (!isMarkdown(file)) return;
			// Files dropped or synced in may already carry a uid.
			syncUidFromFrontmatter(ctx, file);
			autoGenerate(file);
		}));

		host.registerEvent(host.app.vault.on('delete', (file) => {
			if (isMarkdown(file)) forgetFile(ctx, file.path);
		}));

		// Frontmatter edited by the user or another plugin.
		host.registerEvent(host.app.metadataCache.on('changed', (file) => {
			if (isMarkdown(file)) syncUidFromFrontmatter(ctx, file);
		}));

		host.registerEvent(host.app.workspace.on('file-open', (file) => {
			if (!isMarkdown(file)) return;
			const view = host.app.workspace.getActiveViewOfType(MarkdownView);
			if (view?.file === file) autoGenerate(file);
		}));
	});
}

/** True when the file explorer is focused with at least one markdown file selected. */
function hasMarkdownSelection(ctx: UidContext): boolean {
	const leaf = ctx.app.workspace.getLeavesOfType('file-explorer')
		?.find(candidate => candidate.view.getViewType() === 'file-explorer'
			&& ctx.app.workspace.activeLeaf === candidate);
	if (!leaf) return false;

	const selectedPaths = (leaf.view as FileExplorerView).selectedFiles ?? [];
	return selectedPaths.some(path => isMarkdown(ctx.app.vault.getAbstractFileByPath(path)));
}

function registerCommands(host: Plugin, ctx: UidContext): void {
	const { uidKey } = ctx.settings;

	host.addCommand({
		id: 'generate-update-uid',
		name: `Generate/update ${uidKey} (Overwrites)`,
		editorCallback: (editor: Editor, view: MarkdownView) => {
			handleGenerateUpdateUid(ctx, true);
		},
	});

	host.addCommand({
		id: 'create-uid-if-missing',
		name: `Create ${uidKey} if missing`,
		editorCallback: (editor: Editor, view: MarkdownView) => {
			handleCreateUidIfMissing(ctx);
		},
	});

	host.addCommand({
		id: 'remove-uid',
		name: `Remove ${uidKey} from current note`,
		editorCallback: (editor: Editor, view: MarkdownView) => {
			handleRemoveUid(ctx);
		},
	});

	host.addCommand({
		id: 'copy-uid',
		name: `Copy ${uidKey} of current note`,
		editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
			const file = view.file;
			if (!file || !getUIDFromFile(ctx, file)) return false;
			if (!checking) handleCopyUid(ctx);
			return true;
		},
	});

	host.addCommand({
		id: 'copy-title-uid',
		name: `Copy title + ${uidKey}`,
		editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
			const file = view.file;
			if (!file) return false;
			if (!checking) handleCopyTitleUid(ctx, file);
			return true;
		},
	});

	host.addCommand({
		id: 'copy-title-uid-for-selection',
		name: `Copy titles+ ${uidKey}s for selected files`,
		checkCallback: (checking: boolean): boolean => {
			if (!hasMarkdownSelection(ctx)) return false;
			if (!checking) handleCopyTitlesAndUidsForSelection(ctx);
			return true;
		},
	});
}

function registerContextMenus(host: Plugin, ctx: UidContext): void {
	const { uidKey } = ctx.settings;

	host.registerEvent(host.app.workspace.on('file-menu',
		(menu: Menu, fileOrFolder: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => {
			if (fileOrFolder instanceof TFolder) {
				menu.addItem(item => item
					.setTitle(`Copy titles + ${uidKey}s from "${fileOrFolder.name}"`)
					.setIcon('copy')
					.onClick(() => handleCopyTitlesAndUidsFromFolder(ctx, fileOrFolder)));
			} else if (isMarkdown(fileOrFolder)) {
				menu.addItem(item => item
					.setTitle(`Copy title + ${uidKey}`)
					.setIcon('copy')
					.onClick(() => handleCopyTitleUid(ctx, fileOrFolder)));
			}
		}));

	// `files-menu` is undocumented; see src/plugin/obsidian.d.ts.
	host.registerEvent(host.app.workspace.on('files-menu',
		(menu: Menu, files: TAbstractFile[], source: string, leaf?: WorkspaceLeaf) => {
			if (source !== 'file-explorer-context-menu') return;

			const markdownFiles = files.filter(isMarkdown);
			if (markdownFiles.length === 0) return;

			menu.addItem(item => item
				.setTitle(`Copy titles + ${uidKey}s for ${markdownFiles.length} selected`)
				.setIcon('copy')
				.onClick(() => handleCopyTitlesAndUidsForMultipleFiles(ctx, markdownFiles)));
		}));
}

/** Loads the uid state and wires every feature into Obsidian. Called once, from `onload`. */
export async function startUidGenerator(host: Plugin): Promise<void> {
	const ctx = await loadUidState(host);

	registerRibbon(host, ctx);
	registerVaultEvents(host, ctx);
	registerCommands(host, ctx);
	registerContextMenus(host, ctx);
	host.addSettingTab(new UIDSettingTab(host, ctx));
}
