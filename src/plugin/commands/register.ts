import {
	Editor, FileExplorerView, MarkdownView, Menu, Plugin, TAbstractFile, TFile, TFolder, WorkspaceLeaf, debounce,
} from 'obsidian';
import { UidContext } from '../../uid/model/context';
import { isMarkdownNote } from '../../uid/model/note';
import { getUIDFromFile } from '../../uid/storage/frontmatter';
import { handleAutoGenerateUid } from './autoGenerate';
import {
	handleCopyTitleUid, handleCopyTitlesAndUidsForMultipleFiles, handleCopyTitlesAndUidsForSelection,
	handleCopyTitlesAndUidsFromFolder, handleCopyUid,
} from './copy';
import { handleCreateUidIfMissing, handleGenerateUpdateUid, handleRemoveUid } from './noteUid';

/**
 * The head of this folder: every way a user can trigger a uid command, wired
 * into Obsidian in one place. The handlers beside it never name Obsidian's
 * registration API, and nothing outside this folder names the handlers.
 */

// Debounced so a burst of create/open events (startup, vault sync) fires once.
// `leading: true` keeps the first event immediate. This is a global debounce:
// files created less than this apart may not all be handled. Per-file debouncing
// would need a timer per path — more state than the problem is worth.
const AUTO_GENERATE_DEBOUNCE_MS = 500;

function registerRibbon(host: Plugin, ctx: UidContext): void {
	host.addRibbonIcon('fingerprint', `Create ${ctx.settings.uidKey} if missing`, () => {
		handleCreateUidIfMissing(ctx);
	});
}

/** True when the file explorer is focused with at least one markdown file selected. */
function hasMarkdownSelection(ctx: UidContext): boolean {
	const leaf = ctx.app.workspace.getLeavesOfType('file-explorer')
		?.find(candidate => candidate.view.getViewType() === 'file-explorer'
			&& ctx.app.workspace.activeLeaf === candidate);
	if (!leaf) return false;

	const selectedPaths = (leaf.view as FileExplorerView).selectedFiles ?? [];
	return selectedPaths.some(path => isMarkdownNote(ctx.app.vault.getAbstractFileByPath(path)));
}

function registerPaletteCommands(host: Plugin, ctx: UidContext): void {
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
			} else if (isMarkdownNote(fileOrFolder)) {
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

			const markdownFiles = files.filter(isMarkdownNote);
			if (markdownFiles.length === 0) return;

			menu.addItem(item => item
				.setTitle(`Copy titles + ${uidKey}s for ${markdownFiles.length} selected`)
				.setIcon('copy')
				.onClick(() => handleCopyTitlesAndUidsForMultipleFiles(ctx, markdownFiles)));
		}));
}

/**
 * Auto-generation is a command the vault triggers rather than the user, so it
 * is wired here with the rest. Deferred to layout-ready so the startup sweep
 * of file events does not fire it for every note in the vault.
 */
function registerAutoGeneration(host: Plugin, ctx: UidContext): void {
	const autoGenerate = debounce(
		(file: TFile) => handleAutoGenerateUid(ctx, file),
		AUTO_GENERATE_DEBOUNCE_MS,
		true,
	);

	host.app.workspace.onLayoutReady(() => {
		host.registerEvent(host.app.vault.on('create', (file) => {
			if (isMarkdownNote(file)) autoGenerate(file);
		}));

		host.registerEvent(host.app.workspace.on('file-open', (file) => {
			if (!isMarkdownNote(file)) return;
			const view = host.app.workspace.getActiveViewOfType(MarkdownView);
			if (view?.file === file) autoGenerate(file);
		}));
	});
}

/** Wires every uid command in this folder into Obsidian. Called once, at startup. */
export function registerUidCommands(host: Plugin, ctx: UidContext): void {
	registerRibbon(host, ctx);
	registerPaletteCommands(host, ctx);
	registerContextMenus(host, ctx);
	registerAutoGeneration(host, ctx);
}
