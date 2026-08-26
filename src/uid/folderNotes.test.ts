import { describe, expect, it } from 'vitest';
import { TFolder } from 'obsidian';
import { getMarkdownFilesInFolder } from './folderNotes';
import { makeFakeApp } from '../../tests/fakes/app';

/**
 * What "in this folder" means for the folder-scoped actions — clear this
 * folder, copy this folder. The answer decides which notes a destructive pass
 * touches, so the prefix rule below is worth a test of its own.
 */

function paths(app: ReturnType<typeof makeFakeApp>, folderPath: string): string[] {
	const folder = app.folders.get(folderPath) as TFolder;
	return getMarkdownFilesInFolder(app.plugin.app, folder).map(file => file.path);
}

describe('getMarkdownFilesInFolder', () => {
	it('returns the notes in the folder and everything below it', () => {
		const app = makeFakeApp({
			files: [
				{ path: 'Projects/a.md' },
				{ path: 'Projects/deep/b.md' },
				{ path: 'Projects/deep/deeper/c.md' },
			],
		});

		expect(paths(app, 'Projects').sort()).toEqual([
			'Projects/a.md', 'Projects/deep/b.md', 'Projects/deep/deeper/c.md',
		]);
	});

	it('leaves out notes outside the folder', () => {
		const app = makeFakeApp({
			files: [{ path: 'Projects/a.md' }, { path: 'Journal/b.md' }, { path: 'root.md' }],
		});

		expect(paths(app, 'Projects')).toEqual(['Projects/a.md']);
	});

	it('does not match a sibling folder whose name merely starts the same', () => {
		const app = makeFakeApp({
			files: [{ path: 'Projects/a.md' }, { path: 'ProjectsArchive/b.md' }],
		});

		expect(paths(app, 'Projects')).toEqual(['Projects/a.md']);
	});

	it('does not match the folder note itself — a file named after the folder', () => {
		const app = makeFakeApp({
			files: [{ path: 'Projects.md' }, { path: 'Projects/a.md' }],
		});

		expect(paths(app, 'Projects')).toEqual(['Projects/a.md']);
	});

	it('returns the whole vault for the root folder', () => {
		const app = makeFakeApp({
			files: [{ path: 'root.md' }, { path: 'Projects/a.md' }],
		});

		expect(paths(app, '/').sort()).toEqual(['Projects/a.md', 'root.md']);
	});

	it('returns nothing for a folder that holds no notes', () => {
		const app = makeFakeApp({ files: [{ path: 'Projects/deep/a.md' }] });
		const empty = new TFolder();
		empty.path = 'Empty';

		expect(getMarkdownFilesInFolder(app.plugin.app, empty)).toEqual([]);
	});

	it('ignores files that are not notes', () => {
		const app = makeFakeApp({
			files: [
				{ path: 'Projects/a.md' },
				{ path: 'Projects/scan.pdf', extension: 'pdf' },
				{ path: 'Projects/image.png', extension: 'png' },
			],
		});

		expect(paths(app, 'Projects')).toEqual(['Projects/a.md']);
	});
});
