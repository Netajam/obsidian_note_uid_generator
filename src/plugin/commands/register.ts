import {
	Editor, MarkdownView, Menu, Plugin, TAbstractFile, TFile, TFolder, debounce,
} from 'obsidian';
import type { UidContext } from '../../uid/context';
import { handleAutoGenerateUid } from './autoGenerate';
import { handleDuplicateUidCheck } from './duplicateWatch';
import {
	handleCopyTitleUid, handleCopyTitlesAndUidsForMultipleFiles,
	handleCopyTitlesAndUidsForSelection, handleCopyTitlesAndUidsFromFolder, handleCopyUid,
} from './copy';
import { handleCreateUidIfMissing, handleGenerateUpdateUid, handleRemoveUid } from './noteUid';
import { activeNote, asNote, explorerSelection, hasSelectedNotes, notesAmong } from './target';

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

/** A command that acts on whatever note the editor holds — including none, which the handlers answer for. */
function addEditorCommand(host: Plugin, id: string, name: string, run: (file: TFile | null) => void): void {
	host.addCommand({
		id,
		name,
		editorCallback: (editor: Editor, view: MarkdownView) => run(view.file),
	});
}

/** A command Obsidian offers only when the editor holds a note, so it greys out on an empty pane. */
function addNoteCommand(host: Plugin, id: string, name: string, run: (file: TFile) => void): void {
	host.addCommand({
		id,
		name,
		editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
			const file = view.file;
			if (!file) return false;
			if (!checking) run(file);
			return true;
		},
	});
}

function registerPaletteCommands(host: Plugin, ctx: UidContext): void {
	const { uidKey } = ctx.settings;

	addEditorCommand(host, 'generate-update-uid', `Generate/update ${uidKey} (Overwrites)`,
		file => handleGenerateUpdateUid(ctx, file));

	addEditorCommand(host, 'create-uid-if-missing', `Create ${uidKey} if missing`,
		file => handleCreateUidIfMissing(ctx, file));

	addEditorCommand(host, 'remove-uid', `Remove ${uidKey} from current note`,
		file => handleRemoveUid(ctx, file));

	addNoteCommand(host, 'copy-uid', `Copy ${uidKey} of current note`,
		file => handleCopyUid(ctx, file));

	addNoteCommand(host, 'copy-title-uid', `Copy title + ${uidKey}`,
		file => handleCopyTitleUid(ctx, file));

	host.addCommand({
		id: 'copy-title-uid-for-selection',
		name: `Copy titles+ ${uidKey}s for selected files`,
		checkCallback: (checking: boolean): boolean => {
			if (!hasSelectedNotes(ctx.app)) return false;
			if (!checking) handleCopyTitlesAndUidsForSelection(ctx, explorerSelection(ctx.app));
			return true;
		},
	});
}

/** Every context-menu entry this plugin adds is a copy action; they differ only in label and target. */
function addCopyItem(menu: Menu, title: string, run: () => void): void {
	menu.addItem(item => item.setTitle(title).setIcon('copy').onClick(run));
}

/** Right-clicking one entry: a folder copies everything under it, a note copies itself. */
function registerFileMenu(host: Plugin, ctx: UidContext): void {
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
}

/** Right-clicking a multi-file selection. `files-menu` is undocumented; see src/plugin/obsidian.d.ts. */
function registerFilesMenu(host: Plugin, ctx: UidContext): void {
	const { uidKey } = ctx.settings;

	host.registerEvent(host.app.workspace.on('files-menu',
		(menu: Menu, files: TAbstractFile[], source: string) => {
			if (source !== 'file-explorer-context-menu') return;

			const notes = notesAmong(files);
			if (notes.length === 0) return;

			addCopyItem(menu, `Copy titles + ${uidKey}s for ${notes.length} selected`,
				() => handleCopyTitlesAndUidsForMultipleFiles(ctx, notes));
		}));
}

/** A note created in the vault — by the user, by a template, or by a sync coming in. */
function onNoteCreated(host: Plugin, autoGenerate: (file: TFile) => void): void {
	host.registerEvent(host.app.vault.on('create', (file) => {
		const note = asNote(file);
		if (note) autoGenerate(note);
	}));
}

/** A note the user opened. `file-open` also fires for files opened off screen, which do not qualify. */
function onNoteOpened(host: Plugin, autoGenerate: (file: TFile) => void): void {
	host.registerEvent(host.app.workspace.on('file-open', (file) => {
		const note = asNote(file);
		if (note && host.app.workspace.getActiveViewOfType(MarkdownView)?.file === note) {
			autoGenerate(note);
		}
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
		onNoteCreated(host, autoGenerate);
		onNoteOpened(host, autoGenerate);
	});
}

/**
 * Watches for a newly created note that arrived carrying somebody else's uid.
 *
 * It takes two events to see one, because neither is enough on its own.
 * `vault.on('create')` says a note is new but fires before Obsidian has parsed
 * it, so the uid it came with is not readable yet; the first `metadataCache`
 * 'changed' for that path is where the uid appears, but that event says
 * nothing about the note being new — it fires again on every later edit.
 * Pairing them confines the check to notes that are genuinely new, which is
 * both the case worth checking and the only case where renewing a uid is safe.
 *
 * Deferred to layout-ready for the same reason auto-generation is: the startup
 * sweep of file events must not be mistaken for the user creating notes.
 */
function registerDuplicateWatch(host: Plugin, ctx: UidContext): void {
	const awaitingFirstIndex = new Set<string>();

	host.app.workspace.onLayoutReady(() => {
		host.registerEvent(host.app.vault.on('create', (file) => {
			if (asNote(file)) awaitingFirstIndex.add(file.path);
		}));

		host.registerEvent(host.app.metadataCache.on('changed', (file) => {
			const note = asNote(file);
			// `delete` returns false for a note that was not awaiting its first
			// index — an ordinary edit, which this must not act on.
			if (note && awaitingFirstIndex.delete(note.path)) handleDuplicateUidCheck(ctx, note);
		}));

		// Obsidian's own "new note" flow creates `Untitled.md` and renames it
		// before anything is indexed, so the note has to be followed across.
		host.registerEvent(host.app.vault.on('rename', (file, oldPath) => {
			if (awaitingFirstIndex.delete(oldPath) && asNote(file)) awaitingFirstIndex.add(file.path);
		}));

		// A note deleted before it was ever indexed would sit in the set forever.
		host.registerEvent(host.app.vault.on('delete', (file) => awaitingFirstIndex.delete(file.path)));
	});
}

/** Wires every uid command in this folder into Obsidian. Called once, at startup. */
export function registerUidCommands(host: Plugin, ctx: UidContext): void {
	registerRibbon(host, ctx);
	registerPaletteCommands(host, ctx);
	registerFileMenu(host, ctx);
	registerFilesMenu(host, ctx);
	registerAutoGeneration(host, ctx);
	registerDuplicateWatch(host, ctx);
}
