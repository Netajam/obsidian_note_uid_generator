import {
	App, Editor, MarkdownView, Notice, Plugin, TFile, TFolder,
	debounce, Menu, TAbstractFile, WorkspaceLeaf, 
    FileExplorerView
} from 'obsidian';
import { UIDGeneratorSettings, DEFAULT_SETTINGS, UIDSettingTab } from './settings';
import * as commands from './commands';
import * as uidUtils from './uidUtils';

export default class UIDGenerator extends Plugin {
	settings: UIDGeneratorSettings;

	async onload() {
		await this.loadSettings();

		// --- Ribbon Icon ---
		this.addRibbonIcon('fingerprint', `Create ${this.settings.uidKey} if missing`, () => {
			commands.handleCreateUidIfMissing(this);
		});

		// --- Event Listeners ---
        const debouncedFileHandler = debounce(commands.handleAutoGenerateUid.bind(null, this), 500, true);

		this.registerEvent(this.app.vault.on('create', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
               debouncedFileHandler(file);
            }
        }));
		this.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                 const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
                 if (activeLeaf && activeLeaf.file === file) {
                    debouncedFileHandler(file);
                 }
            }
        }));


		// --- Commands ---
		this.addCommand({
			id: 'generate-update-uid',
			name: `Generate/Update ${this.settings.uidKey} (Overwrites)`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
				commands.handleGenerateUpdateUid(this, true);
			}
		});

		this.addCommand({
			id: 'create-uid-if-missing',
			name: `Create ${this.settings.uidKey} if missing`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
                commands.handleCreateUidIfMissing(this);
			}
		});

        this.addCommand({
			id: 'remove-uid',
			name: `Remove ${this.settings.uidKey} from current note`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
                commands.handleRemoveUid(this);
			}
		});

        this.addCommand({
			id: 'copy-uid',
			name: `Copy ${this.settings.uidKey} of current note`,
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                const file = view.file;
                if (!file) return false;
				const uid = uidUtils.getUIDFromFile(this, file); // Check using util
				if (!uid) return false;

				if (!checking) {
                    commands.handleCopyUid(this);
				}
				return true;
			}
		});

         this.addCommand({
			id: 'copy-title-uid',
			name: `Copy title + ${this.settings.uidKey}`,
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
                const file = view.file;
                if (!file) return false; // Only enable if file exists

				if (!checking) {
                    // Pass the specific file from the editor view
                    commands.handleCopyTitleUid(this, file);
                }
				return true;
			}
		});

        // Command Palette command for multi-selection
        this.addCommand({
            id: 'copy-title-uid-for-selection',
            name: `Copy titles+${this.settings.uidKey}s for selected files`,
            checkCallback: (checking: boolean): boolean | void => {
                const fileExplorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')
                    ?.find(leaf => leaf.view.getViewType() === 'file-explorer' && this.app.workspace.activeLeaf === leaf); // More robust check


                    let markdownSelected = false;
                    if (fileExplorerLeaf) {
                        // Use the augmented interface with a type assertion
                        const view = fileExplorerLeaf.view as FileExplorerView; // <-- Use the interface
                        const selectedPaths: string[] = view.selectedFiles || []; // <-- Access via typed view
    
                        // Check if at least one selected file is markdown
                        markdownSelected = selectedPaths.some(path => {
                            // 'this' refers to the Plugin instance in main.ts
                            // 'plugin' refers to the Plugin instance in commands.ts
                            // Make sure to use the correct variable (this or plugin) depending on the file
                            const file = this.app.vault.getAbstractFileByPath(path); // Or plugin.app.vault...
                            return file instanceof TFile && file.extension === 'md';
                        });
                    }

                const canRun = !!fileExplorerLeaf && markdownSelected;

                if (canRun) {
                    if (!checking) {
                        commands.handleCopyTitlesAndUidsForSelection(this);
                    }
                    return true;
                }
                return false;
            },
        });


        // --- Context Menus ---

        // SINGLE Item Context Menu
		this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, fileOrFolder: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => {
			if (fileOrFolder instanceof TFolder) {
				menu.addItem((item) => {
					item
						.setTitle(`Copy titles+${this.settings.uidKey}s from "${fileOrFolder.name}"`)
						.setIcon('copy')
						.onClick(() => commands.handleCopyTitlesAndUidsFromFolder(this, fileOrFolder));
				});
			} else if (fileOrFolder instanceof TFile && fileOrFolder.extension === 'md') {
                 menu.addItem((item) => {
                    item
                        .setTitle(`Copy Title+${this.settings.uidKey}`) // Use specific handler for single file
                        .setIcon('copy')
                        .onClick(() => commands.handleCopyTitleAndUidForFile(this, fileOrFolder));
                });
            }
		}));

        // MULTIPLE Item Context Menu (Undocumented Event)
        this.registerEvent(this.app.workspace.on('files-menu', (menu: Menu, files: TAbstractFile[], source: string, leaf?: WorkspaceLeaf) => {
            if (source !== 'file-explorer-context-menu') { return; }

            const markdownFiles = files.filter((file): file is TFile => file instanceof TFile && file.extension === 'md');

            if (markdownFiles.length > 0) {
                menu.addItem((item) => {
                    item
                        .setTitle(`Copy titles+${this.settings.uidKey}s for ${markdownFiles.length} selected`)
                        .setIcon('copy')
                        // Pass the filtered array of TFiles to the handler
                        .onClick(() => commands.handleCopyTitlesAndUidsForMultipleFiles(this, markdownFiles));
                });
            }
        }));


		// --- Settings Tab ---
		this.addSettingTab(new UIDSettingTab(this.app, this));
	}

	onunload() {
	}

	// --- Settings Management ---
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        if (!Array.isArray(this.settings.autoGenerationExclusions)) {
            this.settings.autoGenerationExclusions = [];
        }
        this.settings.copyFormatString = this.settings.copyFormatString || DEFAULT_SETTINGS.copyFormatString;
        this.settings.copyFormatStringMissingUid = this.settings.copyFormatStringMissingUid || DEFAULT_SETTINGS.copyFormatStringMissingUid;
	}

	async saveSettings() {
		await this.saveData(this.settings);
 
	}

    // --- Public method needed by Settings Tab ---
    async clearUIDsInFolder(folderPath: string): Promise<void> {
        await commands.handleClearUIDsInFolder(this, folderPath);
    }
    async triggerAddMissingUidsInScope(): Promise<void> {
        await commands.handleAddMissingUidsInScope(this);
    }
}