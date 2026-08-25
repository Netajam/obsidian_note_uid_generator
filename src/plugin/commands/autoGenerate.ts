import { TFile } from 'obsidian';
import { UidContext } from '../../uid/model/context';
import { generateUID } from '../../uid/generate';
import { getUIDFromFile, setUID } from '../../uid/storage/frontmatter';
import { isInAutoGenerationScope } from '../../uid/scope';

/** Vault event handler: gives a newly created or opened note a uid, if the settings say so. */
export async function handleAutoGenerateUid(ctx: UidContext, file: TFile | null): Promise<void> {
	if (!ctx.settings.autoGenerateUid) return;
	if (!file || !(file instanceof TFile) || file.extension !== 'md') return;
	if (!isInAutoGenerationScope(ctx.settings, file)) return;
	if (getUIDFromFile(ctx, file)) return; // already has one — skip silently

	await setUID(ctx, file, generateUID(ctx), false);
}
