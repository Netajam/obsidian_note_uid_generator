import { MarkdownView, TFile } from 'obsidian';
import { UidContext } from '../../uid/model/context';

/** The file behind the focused markdown view, or null when the user is not in one. */
export function getActiveFile(ctx: UidContext): TFile | null {
	return ctx.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
}
