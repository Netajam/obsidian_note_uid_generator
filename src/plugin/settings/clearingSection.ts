import { Notice, Setting, normalizePath } from 'obsidian';
import type { UidContext } from '../../uid/model/context';
import { clearUIDsInFolder } from '../../uid/bulk';
import { ConfirmationModal } from './ui/ConfirmationModal';
import { FolderSuggest } from './ui/FolderSuggest';
import type { SettingsSection } from './section';

/**
 * Clearing runs with auto-generation switched off, otherwise the notes it
 * clears are handed straight back a new uid when they are next opened.
 */
async function clearWithAutoGenerationOff(ctx: UidContext, folderPath: string): Promise<void> {
	const autoGenWasOn = ctx.settings.autoGenerateUid;
	if (autoGenWasOn) {
		ctx.settings.autoGenerateUid = false;
		await ctx.saveSettings();
	}

	try {
		await clearUIDsInFolder(ctx, folderPath);
	} catch (err) {
		console.error('[UIDGenerator] Error during bulk uid clearing process:', err);
		new Notice('An unexpected error occurred during uid clearing. Check console.', 5000);
	} finally {
		if (autoGenWasOn) {
			// It stays off — say so rather than silently changing the user's setting back.
			new Notice('Automatic uid generation was disabled. You can re-enable it in settings if desired.', 8000);
		}
	}
}

/** Bulk removal of uids from a folder. Destructive, so it goes through a confirmation modal. */
export function renderClearingSection({ containerEl, ctx, refresh }: SettingsSection): void {
	new Setting(containerEl).setName('Manual uid clearing').setHeading();

	new Setting(containerEl)
		.setName('Folder to clear uids from')
		.setDesc('Specify the vault path to remove uids from notes within.')
		.addText(text => {
			new FolderSuggest(ctx.app, text.inputEl);
			text.setPlaceholder('Example: folder/subfolder')
				.setValue(ctx.settings.folderToClear)
				.onChange(async (value) => {
					ctx.settings.folderToClear = normalizePath(value.trim());
					await ctx.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName('Clear uids in folder')
		.setDesc(`WARNING: This permanently removes the "${ctx.settings.uidKey}" metadata from notes in the specified folder/subfolders and temporarily disables auto-generation.`)
		.addButton(button => button
			.setButtonText('Clear uids now')
			.setWarning()
			.onClick(() => {
				const folderPath = ctx.settings.folderToClear;
				if (!folderPath || folderPath.trim() === '') {
					new Notice("Please specify a folder path in the 'Folder to clear uids from' setting above first.");
					return;
				}

				new ConfirmationModal(ctx.app, folderPath, ctx.settings.uidKey, async () => {
					await clearWithAutoGenerationOff(ctx, folderPath);
					refresh();
				}).open();
			}));
}
