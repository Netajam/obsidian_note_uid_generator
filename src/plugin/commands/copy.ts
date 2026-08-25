import { FileExplorerView, Notice, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { UidContext } from '../../uid/model/context';
import { formatFile, formatFiles } from './format';
import { getUIDFromFile } from '../../uid/storage/frontmatter';
import { getMarkdownFilesInFolder } from '../../uid/folderNotes';
import { getActiveFile } from './activeFile';

/** Everything that puts uids on the clipboard, from a single note up to a whole folder. */

const CLIPBOARD_ERROR_MS = 5000;

async function copyToClipboard(text: string, successMessage: string, errorMessage: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		new Notice(successMessage);
	} catch (err) {
		console.error(`[UIDGenerator] ${errorMessage}`, err);
		new Notice(errorMessage, CLIPBOARD_ERROR_MS);
	}
}

/** Copy just the uid of the current note. */
export async function handleCopyUid(ctx: UidContext): Promise<void> {
	const file = getActiveFile(ctx);
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

/** Copy title + uid for one note — the active one unless a file is named. */
export async function handleCopyTitleUid(ctx: UidContext, specificFile?: TFile): Promise<void> {
	const file = specificFile ?? getActiveFile(ctx);
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
		.filter((file): file is TFile => file instanceof TFile && file.extension === 'md');

	if (files.length === 0) {
		new Notice('No *Markdown* files selected.');
		return;
	}

	await handleCopyTitlesAndUidsForMultipleFiles(ctx, files);
}
