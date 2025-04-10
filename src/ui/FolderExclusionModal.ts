import { App, Modal, TFolder, debounce } from 'obsidian';
import UIDGenerator from '../main';

export class FolderExclusionModal extends Modal {
	plugin: UIDGenerator;
	allFolders: TFolder[];
	suggestionsEl: HTMLElement;
	inputEl: HTMLInputElement;
    onSettingsChanged: () => void; // Callback function

	constructor(app: App, plugin: UIDGenerator, onSettingsChanged: () => void) { // Add callback to constructor
		super(app);
		this.plugin = plugin;
		this.allFolders = this.getAllFolders();
        this.onSettingsChanged = onSettingsChanged; // Store the callback
	}

	getAllFolders(): TFolder[] {
		return this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	onOpen() {
        const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('uid-folder-exclusion-modal');

		contentEl.createEl('h2', { text: 'Manage Excluded Folders' });
		contentEl.createEl('p', { text: 'Add or remove folders from the automatic UID generation exclusion list.' });

		// Search Input
		this.inputEl = contentEl.createEl('input', { type: 'text', placeholder: 'Search folders...' });
		this.inputEl.addClass('uid-search-input');
		this.inputEl.addEventListener('input', debounce(() => this.renderSuggestions(this.inputEl.value), 150, true));

		// Results Container
		this.suggestionsEl = contentEl.createDiv('uid-suggestion-container');

		this.renderSuggestions('');
	}

	renderSuggestions(searchTerm: string) {
        this.suggestionsEl.empty();
		const lowerSearch = searchTerm.toLowerCase().trim();

		const filteredFolders = lowerSearch === ''
            ? this.allFolders
            : this.allFolders.filter(folder => folder.path.toLowerCase().includes(lowerSearch));

        if (filteredFolders.length === 0) {
            this.suggestionsEl.createDiv({text: "No matching folders found.", cls: "uid-no-results"});
            return;
        }

		filteredFolders.forEach(folder => {
			const isExcluded = this.plugin.settings.autoGenerationExclusions.includes(folder.path);
			const settingItem = this.suggestionsEl.createDiv('setting-item');
			const infoDiv = settingItem.createDiv('setting-item-info');
			infoDiv.createDiv({ text: folder.path, cls: 'setting-item-name' });
			const controlDiv = settingItem.createDiv('setting-item-control');
			const button = controlDiv.createEl('button');

			if (isExcluded) {
				button.setText('Remove');
                button.addClass('mod-warning');
				button.onclick = () => this.removeExclusion(folder);
			} else {
				button.setText('Add');
                button.addClass('mod-cta');
				button.onclick = () => this.addExclusion(folder);
			}
		});
	}

	async addExclusion(folder: TFolder) {
		if (!this.plugin.settings.autoGenerationExclusions.includes(folder.path)) {
			this.plugin.settings.autoGenerationExclusions.push(folder.path);
			this.plugin.settings.autoGenerationExclusions.sort();
			await this.plugin.saveSettings();
            this.renderSuggestions(this.inputEl.value); 
            this.onSettingsChanged(); 
		}
	}

    async removeExclusion(folder: TFolder) {
		this.plugin.settings.autoGenerationExclusions = this.plugin.settings.autoGenerationExclusions.filter(p => p !== folder.path);
		await this.plugin.saveSettings();
        this.renderSuggestions(this.inputEl.value); 
        this.onSettingsChanged(); 
	}


	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}