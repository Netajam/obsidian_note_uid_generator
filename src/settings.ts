import { App, PluginSettingTab, Setting, normalizePath, Notice } from 'obsidian';
import UIDGenerator from './main';
import { FolderSuggest } from './ui/FolderSuggest';
import { ConfirmationModal } from './ui/ConfirmationModal';
import { FolderExclusionModal } from './ui/FolderExclusionModal';

// --- Settings Interface ---
export interface UIDGeneratorSettings {
	uidKey: string;
	autoGenerateUid: boolean;
	uidGenerator: 'uuid' | 'nanoid';
	nanoidLength: number;
	nanoidAlphabet: string;
	nanoidSeparators: Array<{ char: string; position: number }>;
	autoGenerationScope: 'vault' | 'folder';
	autoGenerationFolder: string;
	autoGenerationExclusions: string[];
	folderToClear: string;
	copyFormatString: string;
	copyFormatStringMissingUid: string;
}

// --- Default Settings ---
export const DEFAULT_SETTINGS: UIDGeneratorSettings = {
	uidKey: 'uid',
	autoGenerateUid: false,
	uidGenerator: 'uuid',
	nanoidLength: 21,
	nanoidAlphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
	nanoidSeparators: [],
	autoGenerationScope: 'vault',
	autoGenerationFolder: '',
	autoGenerationExclusions: [],
	folderToClear: '',
	copyFormatString: '{title} - {uidKey}: {uid}',
	copyFormatStringMissingUid: '{title} - No {uidKey}',
}

// --- Settings Tab Class ---
export class UIDSettingTab extends PluginSettingTab {
	plugin: UIDGenerator;

	constructor(app: App, plugin: UIDGenerator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// This method re-renders the settings tab content
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- General Settings ---
		new Setting(containerEl)
			.setName('UID metadata key')
			.setDesc('The name of the key for the uid in frontmatter (e.g., "uid", "id"). No spaces.')
			.addText(text => text
				.setPlaceholder('Default: uid')
				.setValue(this.plugin.settings.uidKey)
				.onChange(async (value) => {
					const cleanedValue = value.trim().replace(/\s+/g, '');
					this.plugin.settings.uidKey = cleanedValue || DEFAULT_SETTINGS.uidKey;
					if (value !== this.plugin.settings.uidKey) {
						// Update input value if it was cleaned (e.g., spaces removed)
						text.setValue(this.plugin.settings.uidKey);
					}
					await this.plugin.saveSettings();
					this.display(); // Re-render to potentially update descriptions elsewhere
				}));

		// --- UID Generator Type ---
		new Setting(containerEl).setName('UID generator type').setHeading();

		new Setting(containerEl)
			.setName('Generator algorithm')
			.setDesc('Choose between UUID (standard v4) or NanoID (customizable).')
			.addDropdown(dropdown => dropdown
				.addOption('uuid', 'UUID')
				.addOption('nanoid', 'NanoID')
				.setValue(this.plugin.settings.uidGenerator)
				.onChange(async (value: 'uuid' | 'nanoid') => {
					this.plugin.settings.uidGenerator = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.uidGenerator === 'nanoid') {
			new Setting(containerEl)
				.setName('NanoID length')
				.setDesc('Length of the generated ID (excluding injected characters).')
				.addText(text => text
					.setValue(String(this.plugin.settings.nanoidLength))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.nanoidLength = num;
							await this.plugin.saveSettings();
						}
					}));

			new Setting(containerEl)
				.setName('NanoID alphabet')
				.setDesc('Custom characters to use for ID generation.')
				.addTextArea(text => text
					.setValue(this.plugin.settings.nanoidAlphabet)
					.onChange(async (value) => {
						if (value.length > 0) {
							this.plugin.settings.nanoidAlphabet = value;
							await this.plugin.saveSettings();
						}
					}));

			// --- NanoID Separator Groups ---
			containerEl.createEl('h3', { text: 'NanoID Separator Groups' });
			containerEl.createEl('p', { text: 'Define characters to inject into the NanoID at specific positions. Position is calculated from the raw Base ID.' }).addClass('setting-item-description');

			this.plugin.settings.nanoidSeparators.forEach((separator, index) => {
				const groupContainer = containerEl.createEl('div', { cls: 'uid-separator-group-container' });

				new Setting(groupContainer)
					.setName(`Separator Group ${index + 1}`)
					.setHeading()
					.addButton(button => button
						.setButtonText('Remove')
						.setWarning()
						.setTooltip('Remove this separator group')
						.onClick(async () => {
							this.plugin.settings.nanoidSeparators.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						}));

				new Setting(groupContainer)
					.setName(`Inject character`)
					.setDesc('Character to inject (e.g., "+").')
					.addText(text => text
						.setValue(separator.char)
						.onChange(async (value) => {
							this.plugin.settings.nanoidSeparators[index].char = value;
							await this.plugin.saveSettings();
						}));

				new Setting(groupContainer)
					.setName(`Injection position`)
					.setDesc('Index to inject the character. Negative numbers count from the end.')
					.addText(text => text
						.setValue(String(separator.position))
						.onChange(async (value) => {
							const num = parseInt(value);
							if (!isNaN(num)) {
								this.plugin.settings.nanoidSeparators[index].position = num;
								await this.plugin.saveSettings();
							}
						}));
			});

			new Setting(containerEl)
				.setName('Add new separator group')
				.setDesc('Adds a new group for injecting a character at a specific position.')
				.addButton(button => button
					.setButtonText('Add Group')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.nanoidSeparators.push({ char: '', position: -2 });
						await this.plugin.saveSettings();
						this.display();
					}));
		}

		// --- Automatic UID Generation ---
		new Setting(containerEl).setName('Automatic uid generation').setHeading();
		containerEl.createEl('p', { text: `Automatically add a ${this.plugin.settings.uidKey} to notes when they are created or opened, if they don't already have one.` }).addClass('setting-item-description');

		new Setting(containerEl)
			.setName('Enable automatic uid generation')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoGenerateUid)
				.onChange(async (value) => {
					this.plugin.settings.autoGenerateUid = value;
					await this.plugin.saveSettings();
					this.display(); // Re-render to show/hide dependent settings
				}));

		// Only display scope/exclusion settings if auto-generation is enabled
		if (this.plugin.settings.autoGenerateUid) {
			new Setting(containerEl)
				.setName('Generation scope')
				.addDropdown(dropdown => dropdown
					.addOption('vault', 'Entire Vault')
					.addOption('folder', 'Specific Folder')
					.setValue(this.plugin.settings.autoGenerationScope)
					.onChange(async (value: 'vault' | 'folder') => {
						this.plugin.settings.autoGenerationScope = value;
						await this.plugin.saveSettings();
						this.display();
					}));

			// Display folder input only if scope is 'folder'
			if (this.plugin.settings.autoGenerationScope === 'folder') {
				new Setting(containerEl)
					.setName('Target folder for auto-generation')
					.setDesc('Generate uids only for notes in this folder (and subfolders).')
					.addText(text => {
						new FolderSuggest(this.app, text.inputEl);
						text.setPlaceholder('Example: Notes/Inbox')
							.setValue(this.plugin.settings.autoGenerationFolder)
							.onChange(async (value) => {
								this.plugin.settings.autoGenerationFolder = normalizePath(value.trim());
								await this.plugin.saveSettings();
							});
					});
			}

			// --- Excluded Folders Setting with Modal Button ---
			new Setting(containerEl)
				.setName('Excluded folders')
				.setDesc('Folders excluded from automatic uid generation. Click button to manage.')
				.addButton(button => button
					.setButtonText('Manage exclusions')
					.onClick(() => {
						new FolderExclusionModal(this.app, this.plugin, () => this.display()).open();
					}));

			const exclusionListEl = containerEl.createEl('ul', { cls: 'uid-exclusion-list' });
			if (this.plugin.settings.autoGenerationExclusions.length > 0) {
				const sortedExclusions = [...this.plugin.settings.autoGenerationExclusions].sort();
				sortedExclusions.forEach(folderPath => {
					exclusionListEl.createEl('li', { text: folderPath });
				});
			} else {
				exclusionListEl.createEl('li', { text: 'No folders excluded.' });
			}

		}
		new Setting(containerEl)
			.setName(`Generate missing ${this.plugin.settings.uidKey}s now`)
			.setDesc(`Manually scan notes based on the current 'Generation scope' and 'Excluded folders' settings above. Add a ${this.plugin.settings.uidKey} to any applicable notes that don't already have one. This may take time for large vaults.`)
			.addButton(button => button
				.setButtonText('Generate missing uids')
				.setTooltip('Scan and add missing uids respecting scope/exclusions')
				.onClick(async () => {
					button.setDisabled(true); // Disable button during processing
					button.setButtonText('Processing...');
					try {
						await this.plugin.triggerAddMissingUidsInScope();
					} catch (e) {
						// Catch potential errors from the trigger function itself
						console.error('[UIDGenerator] Error triggering bulk uid generation:', e);
						new Notice('Failed to start bulk generation. See console.', 5000);
					} finally {
						// Re-enable button regardless of success/failure
						button.setDisabled(false);
						button.setButtonText('Generate missing uids');
					}
				}));

		// --- Copy Format Settings ---
		new Setting(containerEl).setName('Copy format').setHeading();
		containerEl.createEl('p', { text: 'Define the format for copied text using placeholders: {title}, {uid}, {uidKey}.' }).addClass('setting-item-description');

		new Setting(containerEl)
			.setName('Format (uid exists)')
			.setDesc('Format string used when copying title and uid, and the uid exists.')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.copyFormatString)
				.setValue(this.plugin.settings.copyFormatString)
				.onChange(async (value) => {
					// Use default if value is empty, otherwise use the provided value
					this.plugin.settings.copyFormatString = value || DEFAULT_SETTINGS.copyFormatString;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Format (uid missing)')
			.setDesc('Format string used when copying, but the note has no uid.')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.copyFormatStringMissingUid)
				.setValue(this.plugin.settings.copyFormatStringMissingUid)
				.onChange(async (value) => {
					// Use default if value is empty, otherwise use the provided value
					this.plugin.settings.copyFormatStringMissingUid = value || DEFAULT_SETTINGS.copyFormatStringMissingUid;
					await this.plugin.saveSettings();
				}));


		// --- Manual uid Clearing ---
		new Setting(containerEl).setName('Manual uid clearing').setHeading();
		new Setting(containerEl)
			.setName('Folder to clear uids from')
			.setDesc('Specify the vault path to remove uids from notes within.')
			.addText(text => {
				new FolderSuggest(this.app, text.inputEl);
				text.setPlaceholder('Example: folder/subfolder')
					.setValue(this.plugin.settings.folderToClear)
					.onChange(async (value) => {
						this.plugin.settings.folderToClear = normalizePath(value.trim());
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Clear uids in folder')
			.setDesc(`WARNING: This permanently removes the "${this.plugin.settings.uidKey}" metadata from notes in the specified folder/subfolders and temporarily disables auto-generation.`)
			.addButton(button => button
				.setButtonText('Clear uids now')
				.setWarning()
				.onClick(async () => {
					const folderPath = this.plugin.settings.folderToClear;
					const uidKey = this.plugin.settings.uidKey;
					// Basic validation for the folder path input
					if (!folderPath || folderPath.trim() === '') {
						new Notice('Please specify a folder path in the \'Folder to clear uids from\' setting above first.');
						return; // Prevent proceeding without a path
					}

					// Open the confirmation modal, passing the necessary info and the confirmation callback
					new ConfirmationModal(this.app, folderPath, uidKey, async () => {
						// --- This code runs ONLY if the user clicks "Confirm" in the modal ---
						let autoGenWasOn = false;
						// 1. Check if auto-generation is enabled and disable it temporarily
						if (this.plugin.settings.autoGenerateUid) {
							autoGenWasOn = true;
							this.plugin.settings.autoGenerateUid = false;
							await this.plugin.saveSettings();
						}

						try {
							// 2. Call the main plugin method to perform the clearing
							await this.plugin.clearUIDsInFolder(folderPath);
						} catch (err) {
							// Catch potential errors during the clearing process
							console.error('[UIDGenerator] Error during bulk uid clearing process:', err);
							new Notice('An unexpected error occurred during uid clearing. Check console.', 5000);
						} finally {
							// 3. This block runs whether the clearing succeeded or failed
							if (autoGenWasOn) {
								// Notify the user that auto-gen was turned off
								new Notice('Automatic uid generation was disabled. You can re-enable it in settings if desired.', 8000);
							}
							// 4. Re-render the settings tab display to reflect any changes
							this.display();
						}
					}).open();
				}));
	}
}
