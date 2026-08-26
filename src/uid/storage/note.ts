import { TAbstractFile, TFile } from 'obsidian';

/**
 * The unit of work this plugin deals in: a markdown note.
 *
 * Vault events hand out `TAbstractFile`, which may be a folder or an
 * attachment, and every entry point has to narrow it the same way before it
 * can say anything about uids.
 */
export function isMarkdownNote(file: TAbstractFile | null | undefined): file is TFile {
	return file instanceof TFile && file.extension === 'md';
}
