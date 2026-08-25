import { normalizePath, TFile, TFolder } from 'obsidian';
import { UidContext } from './model/context';
import { UIDGeneratorSettings } from './model/settings';

/**
 * Folder membership, in one place. Auto-generation, the bulk "add missing"
 * pass and the folder-scoped copy/clear actions all answer the same question
 * — "is this file under that folder?" — and must answer it identically.
 */

/** True when `path` is the folder itself or sits underneath it. '/' means the whole vault. */
function isUnderFolder(path: string, folderPath: string): boolean {
	if (!folderPath) return false;
	if (folderPath === '/') return true;
	return path === folderPath || path.startsWith(folderPath + '/');
}

function isExcluded(exclusions: string[], normalizedPath: string): boolean {
	return exclusions.some(exclusion => isUnderFolder(normalizedPath, normalizePath(exclusion.trim())));
}

function isInTargetFolders(settings: UIDGeneratorSettings, file: TFile, normalizedPath: string): boolean {
	const folders = settings.autoGenerationFolders;
	if (folders.length === 0) return false; // scope is 'folder' but nothing is configured
	return folders.some(folder => {
		const normalized = normalizePath(folder.trim());
		return !!normalized
			&& (normalizedPath.startsWith(normalized + '/') || file.parent?.path === normalized);
	});
}

/** Whether automatic and bulk uid generation should touch this file. */
export function isInAutoGenerationScope(settings: UIDGeneratorSettings, file: TFile): boolean {
	const normalizedPath = normalizePath(file.path);
	if (isExcluded(settings.autoGenerationExclusions, normalizedPath)) return false;
	if (settings.autoGenerationScope !== 'folder') return true;
	return isInTargetFolders(settings, file, normalizedPath);
}

/** Every markdown note inside a folder (and its subfolders), deduplicated by path. */
export function getMarkdownFilesInFolder(ctx: UidContext, folder: TFolder): TFile[] {
	const targetPath = folder.path;
	const seen = new Set<string>();
	const files: TFile[] = [];

	for (const file of ctx.app.vault.getMarkdownFiles()) {
		const isInside = targetPath === '/' ? file.path !== '/' : file.path.startsWith(targetPath + '/');
		if (isInside && !seen.has(file.path)) {
			seen.add(file.path);
			files.push(file);
		}
	}
	return files;
}
