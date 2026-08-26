import { App, TFile, TFolder } from 'obsidian';

/**
 * Enumerating the notes under a folder — the question the folder-scoped
 * actions ask ("clear this folder", "copy this folder"). Distinct from
 * `scope.ts`, which decides whether a note qualifies for auto-generation;
 * these two were one file and shared nothing but a name.
 */

/** Every markdown note inside a folder (and its subfolders), deduplicated by path. */
export function getMarkdownFilesInFolder(app: App, folder: TFolder): TFile[] {
	const targetPath = folder.path;
	const seen = new Set<string>();
	const files: TFile[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const isInside = targetPath === '/' ? file.path !== '/' : file.path.startsWith(targetPath + '/');
		if (isInside && !seen.has(file.path)) {
			seen.add(file.path);
			files.push(file);
		}
	}
	return files;
}
