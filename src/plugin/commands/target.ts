import { MarkdownView, TAbstractFile, TFile } from 'obsidian';
import type { UidContext } from '../../uid/model/context';
import { isMarkdownNote } from '../../uid/model/note';

/**
 * Which note(s) a command acts on.
 *
 * The handlers beside this file never go looking for their own target — the
 * door resolves it here and hands them concrete files. That is what keeps
 * every handler a leaf, and it puts the "is this a note we act on?" narrowing
 * in one place instead of the three it used to live in.
 */

/** The note behind the focused markdown view, or null when the user is not in one. */
export function activeNote(ctx: UidContext): TFile | null {
	return ctx.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
}

/** Narrows one vault entry to a note this plugin acts on. */
export function asNote(file: TAbstractFile | null): TFile | null {
	return isMarkdownNote(file) ? file : null;
}

/** The notes among a mixed set of vault entries. */
export function notesAmong(files: (TAbstractFile | null)[]): TFile[] {
	return files.filter(isMarkdownNote);
}
