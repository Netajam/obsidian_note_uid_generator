import { App, MarkdownView, TAbstractFile, TFile } from 'obsidian';
import { isMarkdownNote } from '../../uid/model/note';

/**
 * Which note(s) a command acts on.
 *
 * The handlers beside this file never go looking for their own target — the
 * door resolves it here and hands them concrete files. That is what keeps
 * every handler a leaf, and it puts the "is this a note we act on?" narrowing
 * in one place instead of the three it used to live in.
 */

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
	return isMarkdownNote(file) ? file : null;
}

/** The notes among a mixed set of vault entries. */
export function notesAmong(files: (TAbstractFile | null)[]): TFile[] {
	return files.filter(isMarkdownNote);
}
