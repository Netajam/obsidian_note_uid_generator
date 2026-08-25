import { App, Modal, TFolder, debounce } from 'obsidian';
import type { UidContext } from '../../../uid/model/context';

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

	/** Paints one row's button for a selection state. The only thing a toggle repaints. */
	private paintButton(button: HTMLButtonElement, isSelected: boolean): void {
		button.setText(isSelected ? 'Remove' : 'Add');
		button.removeClass(isSelected ? 'mod-cta' : 'mod-warning');
		button.addClass(isSelected ? 'mod-warning' : 'mod-cta');
	}

	private renderFolderRow(folder: TFolder) {
		const settingItem = this.suggestionsEl.createDiv('setting-item');
		settingItem.createDiv('setting-item-info')
			.createDiv({ text: folder.path, cls: 'setting-item-name' });
		const button = settingItem.createDiv('setting-item-control').createEl('button');

		this.paintButton(button, this.selectedPaths.includes(folder.path));
		button.onclick = () => this.toggle(folder, button);
	}

	/**
	 * Selects or deselects one folder and repaints just its button.
	 *
	 * It used to re-run `renderSuggestions`, which rebuilt every row — losing
	 * the user's scroll position on each click, and closing a render loop
	 * (toggle → renderSuggestions → renderFolderRow → toggle) that made the
	 * three methods impossible to read in isolation.
	 */
	private async toggle(folder: TFolder, button: HTMLButtonElement) {
		const select = !this.selectedPaths.includes(folder.path);
		const withoutFolder = this.selectedPaths.filter(path => path !== folder.path);
		this.ctx.settings[this.list.field] = select
			? [...withoutFolder, folder.path].sort()
			: withoutFolder;

		await this.ctx.saveSettings();
		this.paintButton(button, select);
		this.onSettingsChanged();
	}

	onClose() {
		this.contentEl.empty();
	}
}
