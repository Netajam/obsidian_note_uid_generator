import { App, Modal, TFolder, debounce } from 'obsidian';
import { UidContext } from '../../../uid/model/context';

/**
 * Picks a set of folders and stores them in one of the settings' folder lists.
 *
 * Auto-generation targets and auto-generation exclusions are the same
 * interaction over two different lists, so they share this modal and differ
 * only by the `FolderList` handed to it.
 */
export interface FolderList {
	/** The `string[]` settings field this picker reads and writes. */
	field: 'autoGenerationFolders' | 'autoGenerationExclusions';
	title: string;
	description: string;
}

export const TARGET_FOLDERS: FolderList = {
	field: 'autoGenerationFolders',
	title: 'Manage target folders',
	description: 'Add or remove folders for automatic uid generation scope.',
};

export const EXCLUDED_FOLDERS: FolderList = {
	field: 'autoGenerationExclusions',
	title: 'Manage excluded folders',
	description: 'Add or remove folders from the automatic uid generation exclusion list.',
};

const SEARCH_DEBOUNCE_MS = 150;

export class FolderPickerModal extends Modal {
	private allFolders: TFolder[];
	private suggestionsEl: HTMLElement;
	private inputEl: HTMLInputElement;

	constructor(
		app: App,
		private ctx: UidContext,
		private list: FolderList,
		private onSettingsChanged: () => void,
	) {
		super(app);
		this.allFolders = this.getAllFolders();
	}

	private getAllFolders(): TFolder[] {
		return this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	private get selectedPaths(): string[] {
		return this.ctx.settings[this.list.field];
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('uid-folder-exclusion-modal');

		contentEl.createEl('h2', { text: this.list.title });
		contentEl.createEl('p', { text: this.list.description });

		this.inputEl = contentEl.createEl('input', { type: 'text', placeholder: 'Search folders...' });
		this.inputEl.addClass('uid-search-input');
		this.inputEl.addEventListener('input', debounce(
			() => this.renderSuggestions(this.inputEl.value),
			SEARCH_DEBOUNCE_MS,
			true,
		));

		this.suggestionsEl = contentEl.createDiv('uid-suggestion-container');
		this.renderSuggestions('');
	}

	private renderSuggestions(searchTerm: string) {
		this.suggestionsEl.empty();
		const lowerSearch = searchTerm.toLowerCase().trim();

		const filteredFolders = lowerSearch === ''
			? this.allFolders
			: this.allFolders.filter(folder => folder.path.toLowerCase().includes(lowerSearch));

		if (filteredFolders.length === 0) {
			this.suggestionsEl.createDiv({ text: 'No matching folders found.', cls: 'uid-no-results' });
			return;
		}

		filteredFolders.forEach(folder => this.renderFolderRow(folder));
	}

	private renderFolderRow(folder: TFolder) {
		const isSelected = this.selectedPaths.includes(folder.path);

		const settingItem = this.suggestionsEl.createDiv('setting-item');
		settingItem.createDiv('setting-item-info')
			.createDiv({ text: folder.path, cls: 'setting-item-name' });
		const button = settingItem.createDiv('setting-item-control').createEl('button');

		button.setText(isSelected ? 'Remove' : 'Add');
		button.addClass(isSelected ? 'mod-warning' : 'mod-cta');
		button.onclick = () => this.toggle(folder, !isSelected);
	}

	private async toggle(folder: TFolder, select: boolean) {
		const current = this.selectedPaths;
		if (select) {
			if (current.includes(folder.path)) return;
			current.push(folder.path);
			current.sort();
		} else {
			this.ctx.settings[this.list.field] = current.filter(path => path !== folder.path);
		}

		await this.ctx.saveSettings();
		this.renderSuggestions(this.inputEl.value);
		this.onSettingsChanged();
	}

	onClose() {
		this.contentEl.empty();
	}
}
