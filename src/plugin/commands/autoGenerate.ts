import { TFile } from 'obsidian';
import type { UidContext } from '../../uid/context';
import { ensureUid } from '../../uid/noteUid/noteUid';

/**
 * Vault event handler: gives a newly created or opened note a uid.
 *
 * The only decision this makes is whether automatic generation is switched on
 * and whether the event is even about a markdown file. Which notes qualify is
 * `ensureUid`'s call, shared with the bulk backfill.
 */
export async function handleAutoGenerateUid(ctx: UidContext, file: TFile | null): Promise<void> {
	if (!ctx.settings.autoGenerateUid) return;
	if (!file || !(file instanceof TFile) || file.extension !== 'md') return;

	await ensureUid(ctx, file);
}
