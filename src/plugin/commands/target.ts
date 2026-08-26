import { App, FileExplorerView, MarkdownView, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';

/**
 * Which note(s) a command acts on.
 *
 * The handlers beside this file never go looking for their own target — the
 * door resolves it here and hands them concrete files. That is what keeps
 * every handler a leaf, and it puts the "is this a note we act on?" narrowing
 * in one place instead of the three it used to live in.
 *
 * Everything here is Obsidian plumbing: workspace views, the file explorer's
 * selection, the markdown extension. None of it names the uid domain, which is
 * why the narrowing below is defined here rather than imported from it — the
 * domain guards its own writes, and this side decides what it forwards.
 */

/** Narrows a vault entry to a markdown note, the only thing this plugin acts on. */
function isNote(file: TAbstractFile | null | undefined): file is TFile {
	return file instanceof TFile && file.extension === 'md';
}

/**
 * The note behind the focused markdown view, or null when the user is not in one.
 *
 * Takes the app rather than the plugin's `UidContext`: finding the focused
 * view has nothing to do with uids, and asking for the whole context would
 * mean a caller had to hold a uid cache to answer a workspace question.
 */
export function activeNote(app: App): TFile | null {
	return app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
}

/** Narrows one vault entry to a note this plugin acts on. */
export function asNote(file: TAbstractFile | null): TFile | null {
	return isNote(file) ? file : null;
}

/** The notes among a mixed set of vault entries. */
export function notesAmong(files: (TAbstractFile | null)[]): TFile[] {
	return files.filter(isNote);
}

/** The file explorer leaf whose selection the command palette should act on. */
function fileExplorerLeaf(app: App): WorkspaceLeaf | null {
	const leaves = app.workspace.getLeavesOfType('file-explorer');
	if (leaves.length === 0) return null;

	const active = app.workspace.activeLeaf;
	return active && active.view.getViewType() === 'file-explorer' ? active : leaves[0];
}

/** What the file explorer has selected, whether or not those entries are notes. */
export interface ExplorerSelection {
	/** How many entries are selected, notes or not. */
	size: number;
	/** The notes among them. */
	notes: TFile[];
}

/** The file explorer's current selection, or null when no file explorer is open. */
export function explorerSelection(app: App): ExplorerSelection | null {
	const leaf = fileExplorerLeaf(app);
	if (!leaf) return null;

	const selectedPaths = (leaf.view as FileExplorerView)?.selectedFiles ?? [];
	return {
		size: selectedPaths.length,
		notes: notesAmong(selectedPaths.map(path => app.vault.getAbstractFileByPath(path))),
	};
}

/**
 * Whether a command over the explorer selection should be offered at all:
 * the file explorer is the *focused* leaf and has at least one note selected.
 * Stricter than `explorerSelection`, which answers for whichever explorer the
 * command would act on rather than only the focused one.
 */
export function hasSelectedNotes(app: App): boolean {
	const leaf = app.workspace.getLeavesOfType('file-explorer')
		?.find(candidate => candidate.view.getViewType() === 'file-explorer'
			&& app.workspace.activeLeaf === candidate);
	if (!leaf) return false;

	const selectedPaths = (leaf.view as FileExplorerView).selectedFiles ?? [];
	return selectedPaths.some(path => isNote(app.vault.getAbstractFileByPath(path)));
}
