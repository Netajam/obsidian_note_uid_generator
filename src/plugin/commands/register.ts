import {
	Editor, MarkdownView, Menu, Plugin, TAbstractFile, TFile, TFolder, debounce,
} from 'obsidian';
import type { UidContext } from '../../uid/model/context';
import { handleAutoGenerateUid } from './autoGenerate';
import {
	canCopySelection, handleCopyTitleUid, handleCopyTitlesAndUidsForMultipleFiles,
	handleCopyTitlesAndUidsForSelection, handleCopyTitlesAndUidsFromFolder, handleCopyUid,
} from './copy';
import { handleCreateUidIfMissing, handleGenerateUpdateUid, handleRemoveUid } from './noteUid';
import { activeNote, asNote, notesAmong } from './target';

/**
 * The head of this folder: every way a user can trigger a uid command, wired
 * into Obsidian in one place. The handlers beside it never name Obsidian's
 * registration API, and nothing outside this folder names the handlers.
 *
 * It also resolves each command's target and hands it over, so no handler has
 * to go looking. That is deliberate: it leaves this file importing siblings
 * only, and every handler free to reach into `src/uid` as a leaf.
 */

// Debounced so a burst of create/open events (startup, vault sync) fires once.
// `leading: true` keeps the first event immediate. This is a global debounce:
// files created less than this apart may not all be handled. Per-file debouncing
// would need a timer per path — more state than the problem is worth.
const AUTO_GENERATE_DEBOUNCE_MS = 500;

function registerRibbon(host: Plugin, ctx: UidContext): void {
	host.addRibbonIcon('fingerprint', `Create ${ctx.settings.uidKey} if missing`, () => {
		handleCreateUidIfMissing(ctx, activeNote(ctx.app));
	});
}

function registerPaletteCommands(host: Plugin, ctx: UidContext): void {
	const { uidKey } = ctx.settings;

	host.addCommand({
		id: 'generate-update-uid',
		name: `Generate/update ${uidKey} (Overwrites)`,
		editorCallback: (editor: Editor, view: MarkdownView) => {
			handleGenerateUpdateUid(ctx, view.file, true);
		},
	});

	host.addCommand({
		id: 'create-uid-if-missing',
		name: `Create ${uidKey} if missing`,
		editorCallback: (editor: Editor, view: MarkdownView) => {
			handleCreateUidIfMissing(ctx, view.file);
		},
	});

	host.addCommand({
		id: 'remove-uid',
		name: `Remove ${uidKey} from current note`,
		editorCallback: (editor: Editor, view: MarkdownView) => {
			handleRemoveUid(ctx, view.file);
		},
	});

	host.addCommand({
		id: 'copy-uid',
		name: `Copy ${uidKey} of current note`,
		editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
			const file = view.file;
			if (!file) return false;
			if (!checking) handleCopyUid(ctx, file);
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
			if (!canCopySelection(ctx)) return false;
			if (!checking) handleCopyTitlesAndUidsForSelection(ctx);
			return true;
		},
	});
}

/** Every context-menu entry this plugin adds is a copy action; they differ only in label and target. */
function addCopyItem(menu: Menu, title: string, run: () => void): void {
	menu.addItem(item => item.setTitle(title).setIcon('copy').onClick(run));
}

function registerContextMenus(host: Plugin, ctx: UidContext): void {
	const { uidKey } = ctx.settings;

	host.registerEvent(host.app.workspace.on('file-menu', (menu: Menu, fileOrFolder: TAbstractFile) => {
		if (fileOrFolder instanceof TFolder) {
			addCopyItem(menu, `Copy titles + ${uidKey}s from "${fileOrFolder.name}"`,
				() => handleCopyTitlesAndUidsFromFolder(ctx, fileOrFolder));
			return;
		}

		const note = asNote(fileOrFolder);
		if (note) {
			addCopyItem(menu, `Copy title + ${uidKey}`, () => handleCopyTitleUid(ctx, note));
		}
	}));

	// `files-menu` is undocumented; see src/plugin/obsidian.d.ts.
	host.registerEvent(host.app.workspace.on('files-menu',
		(menu: Menu, files: TAbstractFile[], source: string) => {
			if (source !== 'file-explorer-context-menu') return;

			const notes = notesAmong(files);
			if (notes.length === 0) return;

			addCopyItem(menu, `Copy titles + ${uidKey}s for ${notes.length} selected`,
				() => handleCopyTitlesAndUidsForMultipleFiles(ctx, notes));
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
			const note = asNote(file);
			if (note) autoGenerate(note);
		}));

		host.registerEvent(host.app.workspace.on('file-open', (file) => {
			const note = asNote(file);
			if (!note) return;
			const view = host.app.workspace.getActiveViewOfType(MarkdownView);
			if (view?.file === note) autoGenerate(note);
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
