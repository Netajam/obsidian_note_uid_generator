import { normalizePath, TFile } from 'obsidian';
import type { UIDGeneratorSettings } from './model/settings';

/**
 * Whether a note is in scope for automatic uid generation. Both callers of
 * `ensureUid` — the per-file vault event and the bulk backfill — reach this
 * through it, so they cannot drift apart.
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
