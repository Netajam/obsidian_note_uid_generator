import { FileExplorerView, Notice, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type { UidContext } from '../../uid/model/context';
import { isMarkdownNote } from '../../uid/model/note';
import { getMarkdownFilesInFolder } from '../../uid/folderNotes';
import { getUIDFromFile } from '../../uid/storage/frontmatter';

/**
 * Everything that puts uids on the clipboard, from a single note up to a whole
 * folder — and the templates that shape them, which exist only to serve this.
 *
 * A leaf: it reaches into the uid domain but depends on no sibling, so the
 * whole folder's coupling to `src/uid` is readable from the imports above.
 */

const CLIPBOARD_ERROR_MS = 5000;

/**
 * Fills a copy-format template.
 * @param formatString Template with the placeholders {title}, {uid} and {uidKey}.
 */
export function formatCopyString(ctx: UidContext, formatString: string, title: string, uid: string | null | undefined): string {
	return formatString
		.replace(/{title}/g, title || '')
		.replace(/{uidKey}/g, ctx.settings.uidKey || '')
		.replace(/{uid}/g, uid || '');
}

/** Renders one file with whichever copy-format template matches its uid state. */
function formatFile(ctx: UidContext, file: TFile): string {
	const uid = getUIDFromFile(ctx, file);
	const template = uid ? ctx.settings.copyFormatString : ctx.settings.copyFormatStringMissingUid;
	return formatCopyString(ctx, template, file.basename, uid);
}

/** Renders a list of files, one per line. */
function formatFiles(ctx: UidContext, files: TFile[]): string {
	return files.map(file => formatFile(ctx, file)).join('\n');
}

async function copyToClipboard(text: string, successMessage: string, errorMessage: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		new Notice(successMessage);
	} catch (err) {
		console.error(`[UIDGenerator] ${errorMessage}`, err);
		new Notice(errorMessage, CLIPBOARD_ERROR_MS);
	}
}

/** Copy just the uid of a note. */
export async function handleCopyUid(ctx: UidContext, file: TFile | null): Promise<void> {
	if (!file) {
		new Notice('No active file.'); // Should not happen — the command's checkCallback guards this
		return;
	}

	const uid = getUIDFromFile(ctx, file);
	if (!uid) {
		new Notice(`No ${ctx.settings.uidKey} found to copy.`);
		return;
	}
	await copyToClipboard(uid, `${ctx.settings.uidKey} copied: ${uid}`, 'Error copying uid to clipboard.');
}

/** Copy title + uid for one note. */
export async function handleCopyTitleUid(ctx: UidContext, file: TFile | null): Promise<void> {
	if (!file) {
		new Notice('No active/specified file found.');
		return;
	}

	const text = formatFile(ctx, file);
	await copyToClipboard(text, `Copied: ${text}`, 'Error copying to clipboard.');
}

/** Folder context menu: copy title + uid for every note inside. */
export async function handleCopyTitlesAndUidsFromFolder(ctx: UidContext, folder: TFolder): Promise<void> {
	const files = getMarkdownFilesInFolder(ctx.app, folder);
	if (files.length === 0) {
		new Notice(`No markdown notes found in "${folder.name}".`);
		return;
	}

	await copyToClipboard(
		formatFiles(ctx, files),
		`Copied ${files.length} items from "${folder.name}" using format.`,
		'Failed to copy to clipboard. See console.',
	);
}

/** Multi-file context menu. */
export async function handleCopyTitlesAndUidsForMultipleFiles(ctx: UidContext, files: TFile[]): Promise<void> {
	if (!files || files.length === 0) {
		new Notice('No Markdown files found in selection.');
		return;
	}

	await copyToClipboard(
		formatFiles(ctx, files),
		`Copied ${files.length} selected items using format.`,
		'Failed to copy selected items to clipboard. See console.',
	);
}

/** The file explorer leaf whose selection the command palette should act on. */
function findFileExplorerLeaf(ctx: UidContext): WorkspaceLeaf | null {
	const leaves = ctx.app.workspace.getLeavesOfType('file-explorer');
	if (leaves.length === 0) return null;

	const active = ctx.app.workspace.activeLeaf;
	return active && active.view.getViewType() === 'file-explorer' ? active : leaves[0];
}

/**
 * Whether the "copy selection" command should be offered: the file explorer is
 * the focused leaf and has at least one note selected. Stricter than
 * `findFileExplorerLeaf`, which is why it lives beside it rather than in the door.
 */
export function canCopySelection(ctx: UidContext): boolean {
	const leaf = ctx.app.workspace.getLeavesOfType('file-explorer')
		?.find(candidate => candidate.view.getViewType() === 'file-explorer'
			&& ctx.app.workspace.activeLeaf === candidate);
	if (!leaf) return false;

	const selectedPaths = (leaf.view as FileExplorerView).selectedFiles ?? [];
	return selectedPaths.some(path => isMarkdownNote(ctx.app.vault.getAbstractFileByPath(path)));
}

/** Command palette: copy title + uid for the files selected in the file explorer. */
export async function handleCopyTitlesAndUidsForSelection(ctx: UidContext): Promise<void> {
	const leaf = findFileExplorerLeaf(ctx);
	if (!leaf) {
		new Notice('No active file explorer found.');
		return;
	}

	const view = leaf.view as FileExplorerView;
	if (!view || !view.selectedFiles || view.selectedFiles.length === 0) {
		new Notice('No files selected in the file explorer.');
		return;
	}

	const files = view.selectedFiles
		.map(path => ctx.app.vault.getAbstractFileByPath(path))
		.filter(isMarkdownNote);

	if (files.length === 0) {
		new Notice('No *Markdown* files selected.');
		return;
	}

	await handleCopyTitlesAndUidsForMultipleFiles(ctx, files);
}
