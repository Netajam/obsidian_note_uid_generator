import { Editor, MarkdownView, TFile, TFolder, Notice, normalizePath, WorkspaceLeaf, FileExplorerView } from 'obsidian';
import UIDGenerator from './main'; 
import * as uidUtils from './uidUtils'; 

// --- Command/Action Implementations ---

/** Logic for Generate/Update Command (explicit overwrite) */
export async function handleGenerateUpdateUid(plugin: UIDGenerator, overwrite: boolean = true): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (view?.file) {
		const file = view.file;
		const newUid = uidUtils.generateUID();
		const setResult = await uidUtils.setUID(plugin, file, newUid, overwrite); // Use util

		if (setResult) {
			new Notice(`${plugin.settings.uidKey} ${overwrite ? 'updated/set' : 'set'} for ${file.basename}`);
		} else if (!overwrite && uidUtils.getUIDFromFile(plugin, file)) {
			// Notice if UID exists and overwrite was false (setUID handles its own console logs)
			new Notice(`Note ${file.basename} already has a ${plugin.settings.uidKey}. Use "Generate/Update" command to overwrite.`);
		}
		// If setResult is false and UID didn't exist, setUID likely showed an error notice
	} else {
		new Notice("No active Markdown file selected.");
	}
}

/** Logic for Ribbon Icon & "Create if Missing" Command (NO overwrite) */
export async function handleCreateUidIfMissing(plugin: UIDGenerator): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (view?.file) {
		const file = view.file;
		const existingUid = uidUtils.getUIDFromFile(plugin, file); // Use util

		if (existingUid) {
			new Notice(`Note ${file.basename} already has a ${plugin.settings.uidKey}.`);
			return;
		}

		const newUid = uidUtils.generateUID();
		const setResult = await uidUtils.setUID(plugin, file, newUid, false); // Use util, NO overwrite

		if (setResult) {
			new Notice(`${plugin.settings.uidKey} created for ${file.basename}`);
		}
		// If setResult is false here, it likely means setUID encountered an error (notice shown there)
	} else {
		new Notice("No active Markdown file selected.");
	}
}

/** Logic for Remove UID Command */
export async function handleRemoveUid(plugin: UIDGenerator): Promise<void> {
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file;
	if (file) {
		const removed = await uidUtils.removeUID(plugin, file);
		if (removed) {
			new Notice(`${plugin.settings.uidKey} removed from ${file.basename}`);
		} else {
            // Check if it exists *before* attempting removal (removeUID handles error notices)
            const exists = uidUtils.getUIDFromFile(plugin, file);
            if (!exists) {
			    new Notice(`No ${plugin.settings.uidKey} found on ${file.basename}.`);
            }
		}
	} else {
		new Notice("No active Markdown file to remove UID from.");
	}
}

/** Logic for Copy UID Command */
export function handleCopyUid(plugin: UIDGenerator): void {
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file;
    if (!file) {
        new Notice("No active file."); // Should not happen due to checkCallback
        return;
    }
    const uid = uidUtils.getUIDFromFile(plugin, file); // CheckCallback ensures UID exists
    if (uid) {
        navigator.clipboard.writeText(uid)
            .then(() => new Notice(`${plugin.settings.uidKey} copied: ${uid}`))
            .catch(err => {
                console.error("[UIDGenerator] Error copying UID:", err);
                new Notice("Error copying UID to clipboard.", 5000);
            });
    } else {
        // Should not happen if checkCallback works correctly
        new Notice(`No ${plugin.settings.uidKey} found to copy.`);
    }
}

/** Logic for Copy Title+UID Command (from Command Palette or single file context menu) */
export function handleCopyTitleUid(plugin: UIDGenerator, specificFile?: TFile): void {
    let fileToProcess: TFile | null = null;

    if (specificFile) {
        fileToProcess = specificFile;
    } else {
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	    fileToProcess = view?.file ?? null;
    }

     if (!fileToProcess) {
        new Notice("No active/specified file found.");
        return;
    }

	const uid = uidUtils.getUIDFromFile(plugin, fileToProcess);
    const title = fileToProcess.basename;

    let textToCopy: string;
    if (uid) {
            textToCopy = uidUtils.formatCopyString(plugin, plugin.settings.copyFormatString, title, uid);
    } else {
            textToCopy = uidUtils.formatCopyString(plugin, plugin.settings.copyFormatStringMissingUid, title, null);
    }
    navigator.clipboard.writeText(textToCopy)
        .then(() => new Notice(`Copied: ${textToCopy}`))
        .catch(err => {
            console.error("[UIDGenerator] Error copying title + UID:", err);
            new Notice("Error copying to clipboard.", 5000);
        });
}


/** Logic for Folder Context Menu Action */
export async function handleCopyTitlesAndUidsFromFolder(plugin: UIDGenerator, folder: TFolder): Promise<void> {
	const markdownFiles = plugin.app.vault.getMarkdownFiles();
	const filesInFolder: TFile[] = [];
	const targetPath = folder.path;

	for (const file of markdownFiles) {
        let isInside = (targetPath === '/') ? file.path !== '/' : file.path.startsWith(targetPath + '/');
		if (isInside && !filesInFolder.some(f => f.path === file.path)) {
			filesInFolder.push(file);
		}
	}

	if (filesInFolder.length === 0) {
		new Notice(`No markdown notes found in "${folder.name}".`);
		return;
	}

	let outputLines: string[] = [];
	let filesWithUidCount = 0;
	const formatExists = plugin.settings.copyFormatString;
	const formatMissing = plugin.settings.copyFormatStringMissingUid;

	for (const file of filesInFolder) {
		const title = file.basename;
		const uid = uidUtils.getUIDFromFile(plugin, file);
		if (uid) {
			outputLines.push(uidUtils.formatCopyString(plugin, formatExists, title, uid));
			filesWithUidCount++;
		} else {
			outputLines.push(uidUtils.formatCopyString(plugin, formatMissing, title, null));
		}
	}

	const outputString = outputLines.join('\n');
	try {
		await navigator.clipboard.writeText(outputString);
		new Notice(`Copied ${outputLines.length} items from "${folder.name}" using format.`);
	} catch (err) {
		console.error(`[UIDGenerator] Error copying folder items to clipboard:`, err);
		new Notice("Failed to copy to clipboard. See console.", 5000);
	}
}

/** Logic for File Context Menu Action (Single File) */
export async function handleCopyTitleAndUidForFile(plugin: UIDGenerator, file: TFile): Promise<void> {

    handleCopyTitleUid(plugin, file);
}

/** Logic for Context Menu: Copy titles+UIDs for multiple selected files */
export async function handleCopyTitlesAndUidsForMultipleFiles(plugin: UIDGenerator, files: TFile[]): Promise<void> {
    if (!files || files.length === 0) {
        new Notice("No Markdown files found in selection.");
        return;
    }

	let outputLines: string[] = [];
	let filesWithUidCount = 0;
	const formatExists = plugin.settings.copyFormatString;
	const formatMissing = plugin.settings.copyFormatStringMissingUid;

	// Iterate through the provided array of TFiles
	for (const file of files) {
		const title = file.basename;
		const uid = uidUtils.getUIDFromFile(plugin, file);
		if (uid) {
			outputLines.push(uidUtils.formatCopyString(plugin, formatExists, title, uid));
			filesWithUidCount++;
		} else {
			outputLines.push(uidUtils.formatCopyString(plugin, formatMissing, title, null));
		}
	}

	const outputString = outputLines.join('\n');
	try {
		await navigator.clipboard.writeText(outputString);
		new Notice(`Copied ${outputLines.length} selected items using format.`);
	} catch (err) {
		console.error(`[UIDGenerator] Error copying selected items (files-menu) to clipboard:`, err);
		new Notice("Failed to copy selected items to clipboard. See console.", 5000);
	}
}

/** Logic for Command Palette: Copy titles+UIDs for selected files in File Explorer */
export async function handleCopyTitlesAndUidsForSelection(plugin: UIDGenerator): Promise<void> {
    // 1. Find the active File Explorer leaf more reliably
    let fileExplorerLeaf: WorkspaceLeaf | undefined = undefined;
    const explorerLeaves = plugin.app.workspace.getLeavesOfType('file-explorer');
    if (explorerLeaves.length > 0) {
        // Prefer the active leaf if it's a file explorer
        if (plugin.app.workspace.activeLeaf && plugin.app.workspace.activeLeaf.view.getViewType() === 'file-explorer') {
             fileExplorerLeaf = plugin.app.workspace.activeLeaf;
        } else {
            fileExplorerLeaf = explorerLeaves[0];
        }
    }

    if (!fileExplorerLeaf) {
        new Notice("No active file explorer found.");
        return;
    }

    // 2. Assert the view type and check for selectedFiles property
    const view = fileExplorerLeaf.view as FileExplorerView;
    if (!view || !view.selectedFiles || view.selectedFiles.length === 0) {
        new Notice("No files selected in the file explorer.");
        return;
    }

    // 3. Get the selected paths 
    const selectedPaths: string[] = view.selectedFiles;

    // 4. Filter for Markdown files 
    const filesToProcess: TFile[] = [];
    for (const path of selectedPaths) {
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile && file.extension === 'md') {
            filesToProcess.push(file);
        }
    }

    if (filesToProcess.length === 0) {
        new Notice("No *Markdown* files selected.");
        return;
    }

    // 5. Delegate to the multi-file handler (no changes needed here)
    await handleCopyTitlesAndUidsForMultipleFiles(plugin, filesToProcess);
}


/** Logic for Clearing UIDs in Folder Action (called from settings) */
export async function handleClearUIDsInFolder(plugin: UIDGenerator, folderPath: string): Promise<void> {
	const normalizedFolderPath = normalizePath(folderPath);
	if (!normalizedFolderPath) { new Notice("Folder path empty."); return; }

	const folder = plugin.app.vault.getAbstractFileByPath(normalizedFolderPath);
	if (!folder || !(folder instanceof TFolder)) { new Notice(`Folder not found or path is not a folder: ${folderPath}`); return; }

	new Notice(`Clearing ${plugin.settings.uidKey}s in "${folder.name}"... This may take a moment.`);

	const markdownFiles = plugin.app.vault.getMarkdownFiles();
	const filesToProcess: TFile[] = [];
	const targetPath = folder.path;

	for (const file of markdownFiles) {
        let isInside = (targetPath === '/') ? file.path !== '/' : file.path.startsWith(targetPath + '/');
		if (isInside && !filesToProcess.some(f => f.path === file.path)) {
			filesToProcess.push(file);
		}
	}

	if (filesToProcess.length === 0) {
		new Notice(`No markdown files found within "${folder.name}".`);
		return;
	}

	let clearedCount = 0;
	let errorCount = 0;

	for (const file of filesToProcess) {
		try {
			const removed = await uidUtils.removeUID(plugin, file);
			if (removed) clearedCount++;
		} catch (err) {
			errorCount++;
		}
	}

	let message = `UID clearing complete for "${folder.name}". Removed ${clearedCount} ${plugin.settings.uidKey}s.`;
	if (errorCount > 0) {
		message += ` Encountered ${errorCount} errors (check console).`;
	}
	new Notice(message, 10000);
}


/** Handler for file create/open events for auto-generation */
export async function handleAutoGenerateUid(plugin: UIDGenerator, file: TFile | null): Promise<void> {
	if (!plugin.settings.autoGenerateUid || !file || !(file instanceof TFile) || file.extension !== 'md') {
		return;
	}

	const normalizedPath = normalizePath(file.path);

	// Check exclusions
	if (plugin.settings.autoGenerationExclusions.some(ex => {
		const normEx = normalizePath(ex.trim());
		return normEx && (normalizedPath.startsWith(normEx + '/') || normalizedPath === normEx);
	})) {
		return; // Excluded
	}

	// Check scope
	if (plugin.settings.autoGenerationScope === 'folder') {
		const normScope = normalizePath(plugin.settings.autoGenerationFolder.trim());
		if (!normScope || !(normalizedPath.startsWith(normScope + '/') || file.parent?.path === normScope)) {
			return; // Outside scope
		}
	}

	// Check if UID exists
	if (uidUtils.getUIDFromFile(plugin, file)) {
		return; // Skip silently
	}

	// Generate and set
	const newUid = uidUtils.generateUID();
	await uidUtils.setUID(plugin, file, newUid, false);
}
export async function handleAddMissingUidsInScope(plugin: UIDGenerator): Promise<void> {
	const allFiles = plugin.app.vault.getMarkdownFiles();
	if (allFiles.length === 0) {
		new Notice("No Markdown files found in the vault.");
		return;
	}

	let addedCount = 0;
	let skippedExistingCount = 0;
    let skippedScopeCount = 0;
	let errorCount = 0;
    const totalFiles = allFiles.length;

	const noticeMessage = `Processing ${totalFiles} files for missing UIDs...`;
	const notice = new Notice(noticeMessage, 0); // Show notice indefinitely until updated/hidden


	try { // Wrap the loop for final notice update
		for (let i = 0; i < totalFiles; i++) {
			const file = allFiles[i];
            const normalizedPath = normalizePath(file.path);

            // Update progress notice periodically
            if (i % 50 === 0 && i > 0) { // Update every 50 files
                notice.setMessage(`${noticeMessage}\n(${i}/${totalFiles})`);
            }

			// --- Check Scope and Exclusions ---
            let isInScope = true;
            // 1. Check exclusions
            if (plugin.settings.autoGenerationExclusions.some(ex => {
                const normEx = normalizePath(ex.trim());
                return normEx && (normalizedPath.startsWith(normEx + '/') || normalizedPath === normEx);
            })) {
                isInScope = false; // Excluded
            }

            // 2. Check scope if not already excluded
            if (isInScope && plugin.settings.autoGenerationScope === 'folder') {
                const normScope = normalizePath(plugin.settings.autoGenerationFolder.trim());
                if (!normScope || !(normalizedPath.startsWith(normScope + '/') || file.parent?.path === normScope)) {
                    isInScope = false; // Outside scope folder
                }
            }

            if (!isInScope) {
                skippedScopeCount++;
                continue; // Skip this file
            }
            // --- End Scope Check ---


			// --- Check if UID already exists ---
			const existingUid = uidUtils.getUIDFromFile(plugin, file);
			if (existingUid) {
				skippedExistingCount++;
				continue; // Skip this file
			}

			// --- Generate and Set UID ---
			const newUid = uidUtils.generateUID();
			try {
				const success = await uidUtils.setUID(plugin, file, newUid, false); // Do not overwrite
				if (success) {
					addedCount++;
				} else {
                    // setUID internally handles Notice on error, just count it
                    errorCount++;
                }
			} catch (err) {
                // Catch any unexpected errors from setUID itself
				console.error(`[UIDGenerator] Unexpected error setting UID for ${file.path}:`, err);
				errorCount++;
			}

            // Optional: Yield to prevent freezing on very large vaults
            if (i % 100 === 0 && i > 0) { // Yield every 100 files
                 await new Promise(resolve => setTimeout(resolve, 0));
            }
		} // End for loop
	} finally {
        // --- Update/Hide Notice and Log Results ---
        notice.hide(); // Hide the progress notice

        let summary = `Bulk UID Generation Complete:\n- Added: ${addedCount}\n- Skipped (already had UID): ${skippedExistingCount}\n- Skipped (out of scope/excluded): ${skippedScopeCount}`;
        if (errorCount > 0) {
            summary += `\n- Errors: ${errorCount} (see console)`;
        }

        new Notice(summary, 10000 + errorCount * 100); // Show longer if errors
    }
}