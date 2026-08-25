import { Notice, Setting } from 'obsidian';
import { addMissingUidsInScope } from '../../uid/bulk';
import { EXCLUDED_FOLDERS, FolderList, FolderPickerModal, TARGET_FOLDERS } from './ui/FolderPickerModal';
import { SettingsSection } from './section';

/** Renders a folder list as a `<ul>`, with a placeholder line when it is empty. */
function renderFolderList(containerEl: HTMLElement, paths: string[], emptyText: string): void {
	const listEl = containerEl.createEl('ul', { cls: 'uid-exclusion-list' });
	if (paths.length === 0) {
		listEl.createEl('li', { text: emptyText });
		return;
	}
	[...paths].sort().forEach(path => listEl.createEl('li', { text: path }));
}

/** A "Manage …" button that opens the folder picker, plus the current list underneath it. */
function renderFolderPicker(
	section: SettingsSection,
	list: FolderList,
	setting: { name: string; desc: string; buttonText: string; emptyText: string },
): void {
	const { containerEl, ctx, refresh } = section;

	new Setting(containerEl)
		.setName(setting.name)
		.setDesc(setting.desc)
		.addButton(button => button
			.setButtonText(setting.buttonText)
			.onClick(() => {
				new FolderPickerModal(ctx.app, ctx, list, refresh).open();
			}));

	renderFolderList(containerEl, ctx.settings[list.field], setting.emptyText);
}

function renderScope(section: SettingsSection): void {
	const { containerEl, ctx, refresh } = section;

	new Setting(containerEl)
		.setName('Generation scope')
		.addDropdown(dropdown => dropdown
			.addOption('vault', 'Entire Vault')
			.addOption('folder', 'Specific Folder(s)')
			.setValue(ctx.settings.autoGenerationScope)
			.onChange(async (value: 'vault' | 'folder') => {
				ctx.settings.autoGenerationScope = value;
				await ctx.saveSettings();
				refresh();
			}));

	if (ctx.settings.autoGenerationScope === 'folder') {
		renderFolderPicker(section, TARGET_FOLDERS, {
			name: 'Target folders for auto-generation',
			desc: 'Generate uids only for notes in these folders (and subfolders).',
			buttonText: 'Manage folders',
			emptyText: 'No target folders specified. Auto-generation is effectively disabled for folder scope.',
		});
	}

	renderFolderPicker(section, EXCLUDED_FOLDERS, {
		name: 'Excluded folders',
		desc: 'Folders excluded from automatic uid generation. Click button to manage.',
		buttonText: 'Manage exclusions',
		emptyText: 'No folders excluded.',
	});
}

/** The one-off "catch up the whole vault" button. */
function renderBackfillButton({ containerEl, ctx }: SettingsSection): void {
	const { uidKey } = ctx.settings;

	new Setting(containerEl)
		.setName(`Generate missing ${uidKey}s now`)
		.setDesc(`Manually scan notes based on the current 'Generation scope' and 'Excluded folders' settings above. Add a ${uidKey} to any applicable notes that don't already have one. This may take time for large vaults.`)
		.addButton(button => button
			.setButtonText('Generate missing uids')
			.setTooltip('Scan and add missing uids respecting scope/exclusions')
			.onClick(async () => {
				button.setDisabled(true);
				button.setButtonText('Processing...');
				try {
					await addMissingUidsInScope(ctx);
				} catch (e) {
					console.error('[UIDGenerator] Error triggering bulk uid generation:', e);
					new Notice('Failed to start bulk generation. See console.', 5000);
				} finally {
					button.setDisabled(false);
					button.setButtonText('Generate missing uids');
				}
			}));
}

/** When uids are created automatically, and for which notes. */
export function renderAutoGenerationSection(section: SettingsSection): void {
	const { containerEl, ctx, refresh } = section;

	new Setting(containerEl)
		.setName('Automatic uid generation')
		.setDesc(`Automatically add a ${ctx.settings.uidKey} to notes when they are created or opened, if they don't already have one.`)
		.setHeading();

	new Setting(containerEl)
		.setName('Enable automatic uid generation')
		.addToggle(toggle => toggle
			.setValue(ctx.settings.autoGenerateUid)
			.onChange(async (value) => {
				ctx.settings.autoGenerateUid = value;
				await ctx.saveSettings();
				refresh(); // scope and exclusion settings appear/disappear with this
			}));

	if (ctx.settings.autoGenerateUid) {
		renderScope(section);
	}

	renderBackfillButton(section);
}
