import { TFile } from 'obsidian';
import { UidContext } from '../../uid/model/context';
import { getUIDFromFile } from '../../uid/storage/frontmatter';

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
export function formatFile(ctx: UidContext, file: TFile): string {
	const uid = getUIDFromFile(ctx, file);
	const template = uid ? ctx.settings.copyFormatString : ctx.settings.copyFormatStringMissingUid;
	return formatCopyString(ctx, template, file.basename, uid);
}

/** Renders a list of files, one per line. */
export function formatFiles(ctx: UidContext, files: TFile[]): string {
	return files.map(file => formatFile(ctx, file)).join('\n');
}
