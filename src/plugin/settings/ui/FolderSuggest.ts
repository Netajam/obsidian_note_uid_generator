import { App, TFolder, AbstractInputSuggest } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, private inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const lowerCaseQuery = query.toLowerCase();
		const folders = this.app.vault.getAllLoadedFiles()
			.filter((file): file is TFolder =>
				file instanceof TFolder &&
				file.path.toLowerCase().contains(lowerCaseQuery)
			);
		folders.sort((a, b) => a.path.localeCompare(b.path));
		return folders;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path;
		this.inputEl.trigger("input"); 
		this.close();
	}
}