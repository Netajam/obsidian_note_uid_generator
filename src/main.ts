import {
	Editor, MarkdownView, Plugin, TFile, TFolder,
	debounce, Menu, TAbstractFile, WorkspaceLeaf,
	FileExplorerView, normalizePath
} from 'obsidian';
import { UIDGeneratorSettings, DEFAULT_SETTINGS, UIDSettingTab } from './settings';
import * as commands from './commands';
import * as uidUtils from './uidUtils';

export default class UIDGenerator extends Plugin {
	settings: UIDGeneratorSettings;
	uidCache: Set<string> = new Set();
	uidPathMap: Map<string, string> = new Map(); // filePath → uid

	async onload() {
		await this.loadSettings();

		// Refresh the cached machine Node ID for Snowflake on plugin load.
		// The override (if any) takes precedence at generation time, but we
		// still want the machine value to reflect the current hardware.
		if (this.settings.uidGenerator === 'snowflake') {
			const next = uidUtils.resolveAutoDetectedNodeId(this.settings.snowflakeNodeId);
			if (next !== null) {
				this.settings.snowflakeNodeId = next;
				await this.saveSettings();
			}
		}

		// --- Ribbon Icon ---
		this.addRibbonIcon('fingerprint', `Create ${this.settings.uidKey} if missing`, () => {
			commands.handleCreateUidIfMissing(this);
		});

		// --- Event Listeners ---
		// Debounce the handler to prevent rapid firing, especially on startup or multiple quick actions.
		// `leading: true` ensures the first event triggers immediately.
		// Note: This is a global debounce. If many files are created/opened < 500ms apart,
		// only the first one might trigger the handler in that interval. Per-file debouncing
		// could be implemented but adds complexity (managing timers per file path).
		const debouncedFileHandler = debounce(commands.handleAutoGenerateUid.bind(null, this), 500, true);
		this.app.workspace.onLayoutReady(() => {
			this.buildUidCache();
			this.registerEvent(this.app.vault.on('create', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					// Sync cache for files dropped/synced into vault that already have a UID
					const existingUid = uidUtils.getUIDFromFile(this, file);
					if (existingUid) {
						this.uidCache.add(existingUid);
						this.uidPathMap.set(file.path, existingUid);
					}
					debouncedFileHandler(file);
				}
			}));
			this.registerEvent(this.app.vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					// Use path map since metadata cache may already be cleared
					const uid = this.uidPathMap.get(file.path);
					if (uid) {
						this.uidCache.delete(uid);
						this.uidPathMap.delete(file.path);
					}
				}
			}));
			// Sync cache when frontmatter is edited externally or by another plugin
			this.registerEvent(this.app.metadataCache.on('changed', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					const oldUid = this.uidPathMap.get(file.path);
					const newUid = uidUtils.getUIDFromFile(this, file);
					if (oldUid !== newUid) {
						if (oldUid) {
							this.uidCache.delete(oldUid);
						}
						if (newUid) {
							this.uidCache.add(newUid);
							this.uidPathMap.set(file.path, newUid);
						} else {
							this.uidPathMap.delete(file.path);
						}
					}
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
		});

		// --- Commands ---
		this.addCommand({
			id: 'generate-update-uid',
			name: `Generate/update ${this.settings.uidKey} (Overwrites)`,
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
			name: `Copy titles+ ${this.settings.uidKey}s for selected files`,
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
						.setTitle(`Copy titles + ${this.settings.uidKey}s from "${fileOrFolder.name}"`)
						.setIcon('copy')
						.onClick(() => commands.handleCopyTitlesAndUidsFromFolder(this, fileOrFolder));
				});
			} else if (fileOrFolder instanceof TFile && fileOrFolder.extension === 'md') {
				menu.addItem((item) => {
					item
						.setTitle(`Copy title + ${this.settings.uidKey}`)
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
						.setTitle(`Copy titles + ${this.settings.uidKey}s for ${markdownFiles.length} selected`)
						.setIcon('copy')
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
		if (!Array.isArray(this.settings.nanoidSeparators)) {
			this.settings.nanoidSeparators = [];
		}
		if (!Array.isArray(this.settings.autoGenerationFolders)) {
			this.settings.autoGenerationFolders = [];
		}
		this.settings.copyFormatString = this.settings.copyFormatString || DEFAULT_SETTINGS.copyFormatString;
		this.settings.copyFormatStringMissingUid = this.settings.copyFormatStringMissingUid || DEFAULT_SETTINGS.copyFormatStringMissingUid;

		// One-shot migration from the legacy single-folder string to the array.
		// Clears the old field so subsequent loads no-op without rewriting settings.
		if (this.settings.autoGenerationFolder && this.settings.autoGenerationFolder.trim() !== '') {
			const oldFolder = normalizePath(this.settings.autoGenerationFolder.trim());
			if (oldFolder && !this.settings.autoGenerationFolders.includes(oldFolder)) {
				this.settings.autoGenerationFolders.push(oldFolder);
			}
			this.settings.autoGenerationFolder = '';
			await this.saveSettings();
		}

		// One-shot migration from the legacy Snowflake auto-detect toggle to
		// the override field. Earlier PR builds stored a manual Node ID in
		// `snowflakeNodeId` with `snowflakeAutoDetectNodeId === false`; carry
		// that intent forward as a custom override so the user's pick survives.
		if (typeof this.settings.snowflakeAutoDetectNodeId === 'boolean') {
			if (
				this.settings.snowflakeAutoDetectNodeId === false
				&& this.settings.snowflakeNodeIdOverride === null
				&& this.settings.snowflakeNodeId > 0
			) {
				this.settings.snowflakeNodeIdOverride = this.settings.snowflakeNodeId;
				this.settings.snowflakeNodeId = 0; // re-detect on next load
			}
			delete this.settings.snowflakeAutoDetectNodeId;
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);

	}

	// --- UID Cache ---
	buildUidCache(): void {
		this.uidCache.clear();
		this.uidPathMap.clear();
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const uid = uidUtils.getUIDFromFile(this, file);
			if (uid) {
				this.uidCache.add(uid);
				this.uidPathMap.set(file.path, uid);
			}
		}
	}

	// --- Public method needed by Settings Tab ---
	async clearUIDsInFolder(folderPath: string): Promise<void> {
		await commands.handleClearUIDsInFolder(this, folderPath);
	}
	async triggerAddMissingUidsInScope(): Promise<void> {
		await commands.handleAddMissingUidsInScope(this);
	}
}
