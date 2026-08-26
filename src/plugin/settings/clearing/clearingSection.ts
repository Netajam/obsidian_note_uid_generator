import { Notice, Setting, normalizePath } from 'obsidian';
import { clearFolderUids } from './clearUids';
import { ConfirmationModal } from './ConfirmationModal';
import { FolderSuggest } from './FolderSuggest';
import type { SettingsSection } from '../section';

/** Where to clear, with folder autocompletion. Saved as it is typed, so the button below can read it. */
function renderFolderField({ containerEl, ctx }: SettingsSection): void {
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
}

/** The destructive half: nothing happens until the user confirms the folder by name. */
function renderClearButton({ containerEl, ctx, refresh }: SettingsSection): void {
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
					await clearFolderUids(ctx, folderPath);
					refresh();
				}).open();
			}));
}

/** Bulk removal of uids from a folder. Destructive, so it goes through a confirmation modal. */
export function renderClearingSection(section: SettingsSection): void {
	new Setting(section.containerEl).setName('Manual uid clearing').setHeading();

	renderFolderField(section);
	renderClearButton(section);
}
