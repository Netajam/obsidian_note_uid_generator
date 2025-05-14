import { App, Modal, Setting } from 'obsidian';

// Confirmation Modal
export class ConfirmationModal extends Modal {
	folderPath: string;
	uidKey: string;
	onConfirm: () => void; // Callback function when user confirms

	constructor(app: App, folderPath: string, uidKey: string, onConfirm: () => void) {
		super(app);
		this.folderPath = folderPath;
        this.uidKey = uidKey;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty(); 

		contentEl.createEl('h2', { text: 'Confirm uid deletion' });
		contentEl.createEl('p', { text: `Are you sure you want to remove the '${this.uidKey}' metadata property from all notes within the folder "${this.folderPath}" and its subfolders?` });
		contentEl.createEl('p', { text: `This action cannot be undone.` }).addClass('mod-warning');

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		// Confirm Button
		new Setting(buttonContainer)
			.addButton((btn) =>
				btn
					.setButtonText('Confirm deletion')
					.setWarning()
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm(); 
					}));

		// Cancel Button
		new Setting(buttonContainer)
			.addButton((btn) =>
				btn
					.setButtonText('Cancel')
					.onClick(() => {
						this.close(); 
					}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
