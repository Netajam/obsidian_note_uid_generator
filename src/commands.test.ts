import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TFolder } from 'obsidian';
import {
	handleAutoGenerateUid,
	handleAddMissingUidsInScope,
	handleClearUIDsInFolder,
	handleCopyTitleUid,
	handleGenerateUpdateUid,
	handleCreateUidIfMissing,
	handleRemoveUid,
	handleCopyUid,
	handleCopyTitlesAndUidsFromFolder,
	handleCopyTitlesAndUidsForMultipleFiles,
} from './commands';
import { makeFakeApp, installFakeClipboard } from '../tests/fakes/app';
import type { UIDGeneratorSettings } from './settings';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('handleAutoGenerateUid — settings-driven decisions', () => {
	type Case = {
		name: string;
		settings: Partial<UIDGeneratorSettings>;
		filePath: string;
		extension?: string;
		existingUid?: string;
		shouldGenerate: boolean;
	};

	const cases: Case[] = [
		{
			name: 'autoGenerateUid=false → no-op even on a plain markdown file',
			settings: { autoGenerateUid: false },
			filePath: 'foo.md',
			shouldGenerate: false,
		},
		{
			name: 'non-markdown file → no-op',
			settings: { autoGenerateUid: true },
			filePath: 'image.png',
			extension: 'png',
			shouldGenerate: false,
		},
		{
			name: 'autoGen=on, scope=vault, no exclusions → generates',
			settings: { autoGenerateUid: true, autoGenerationScope: 'vault' },
			filePath: 'foo.md',
			shouldGenerate: true,
		},
		{
			name: 'autoGen=on, file already has uid → no-op',
			settings: { autoGenerateUid: true, autoGenerationScope: 'vault' },
			filePath: 'foo.md',
			existingUid: 'pre-existing',
			shouldGenerate: false,
		},
		{
			name: 'scope=folder, file inside scope → generates',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
			},
			filePath: 'Notes/foo.md',
			shouldGenerate: true,
		},
		{
			name: 'scope=folder, file in nested subfolder of scope → generates',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
			},
			filePath: 'Notes/sub/deep/foo.md',
			shouldGenerate: true,
		},
		{
			name: 'scope=folder, file outside scope → no-op',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
			},
			filePath: 'OtherFolder/foo.md',
			shouldGenerate: false,
		},
		{
			name: 'scope=folder with empty folders array → no-op (defensive)',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: [],
			},
			filePath: 'foo.md',
			shouldGenerate: false,
		},
		{
			name: 'scope=vault with exclusion match → no-op',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'vault',
				autoGenerationExclusions: ['Drafts'],
			},
			filePath: 'Drafts/foo.md',
			shouldGenerate: false,
		},
		{
			name: 'scope=vault with exclusion match in subfolder → no-op',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'vault',
				autoGenerationExclusions: ['Drafts'],
			},
			filePath: 'Drafts/sub/foo.md',
			shouldGenerate: false,
		},
		{
			name: 'scope=vault, exclusion does not match this file → generates',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'vault',
				autoGenerationExclusions: ['Drafts'],
			},
			filePath: 'Notes/foo.md',
			shouldGenerate: true,
		},
		{
			name: 'scope=folder with nested exclusion → exclusion wins',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
				autoGenerationExclusions: ['Notes/private'],
			},
			filePath: 'Notes/private/secret.md',
			shouldGenerate: false,
		},
		{
			name: 'scope=folder with sibling not under exclusion → generates',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
				autoGenerationExclusions: ['Notes/private'],
			},
			filePath: 'Notes/public/ok.md',
			shouldGenerate: true,
		},
	];

	for (const c of cases) {
		it(c.name, async () => {
			const fm = c.existingUid ? { uid: c.existingUid } : {};
			const app = makeFakeApp({
				files: [{ path: c.filePath, extension: c.extension, frontmatter: fm }],
				settings: c.settings,
			});
			const file = app.files[0];

			await handleAutoGenerateUid(app.plugin, file);

			const after = app.frontmatterByPath.get(c.filePath) ?? {};
			if (c.shouldGenerate) {
				expect(after.uid).toMatch(UUID_RE);
				expect(app.plugin.uidCache.has(after.uid as string)).toBe(true);
			} else if (c.existingUid) {
				expect(after.uid).toBe(c.existingUid);
			} else {
				expect(after.uid).toBeUndefined();
			}
		});
	}
});

describe('handleAutoGenerateUid — multi-folder scope', () => {
	async function runOn(
		filePath: string,
		folders: string[],
	): Promise<string | undefined> {
		const app = makeFakeApp({
			files: [{ path: filePath }],
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: folders,
			},
		});
		await handleAutoGenerateUid(app.plugin, app.files[0]);
		return app.frontmatterByPath.get(filePath)?.uid as string | undefined;
	}

	it('generates when the file is in any of the configured folders', async () => {
		expect(await runOn('Notes/a.md', ['Notes', 'Journal'])).toMatch(UUID_RE);
		expect(await runOn('Journal/b.md', ['Notes', 'Journal'])).toMatch(UUID_RE);
	});

	it('skips files that are in none of the configured folders', async () => {
		expect(await runOn('Other/a.md', ['Notes', 'Journal'])).toBeUndefined();
	});

	it('matches files in nested subfolders of a configured folder', async () => {
		expect(await runOn('Notes/sub/deep/a.md', ['Notes'])).toMatch(UUID_RE);
	});

	it('treats an empty folders array as out-of-scope for every file', async () => {
		expect(await runOn('Notes/a.md', [])).toBeUndefined();
		expect(await runOn('a.md', [])).toBeUndefined();
	});

	it('strips surrounding whitespace from folder entries', async () => {
		expect(await runOn('Notes/a.md', ['  Notes  '])).toMatch(UUID_RE);
	});

	it('ignores blank/whitespace-only folder entries instead of matching everything', async () => {
		// If an empty string accidentally matched as a prefix, every file would be in scope.
		// The guard `normScope && (...)` should keep blank entries inert.
		expect(await runOn('Other/a.md', ['', '   '])).toBeUndefined();
	});
});

describe('handleAutoGenerateUid — exclusion list edge cases', () => {
	async function runOn(
		filePath: string,
		exclusions: string[],
	): Promise<string | undefined> {
		const app = makeFakeApp({
			files: [{ path: filePath }],
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'vault',
				autoGenerationExclusions: exclusions,
			},
		});
		await handleAutoGenerateUid(app.plugin, app.files[0]);
		return app.frontmatterByPath.get(filePath)?.uid as string | undefined;
	}

	it('honours every entry in a multi-folder exclusion list', async () => {
		expect(await runOn('Drafts/a.md', ['Drafts', 'Templates'])).toBeUndefined();
		expect(await runOn('Templates/b.md', ['Drafts', 'Templates'])).toBeUndefined();
		expect(await runOn('Notes/c.md', ['Drafts', 'Templates'])).toMatch(UUID_RE);
	});

	it('still applies later exclusions when an earlier one does not match', async () => {
		// `.some()` short-circuits on the first match; this proves a non-match
		// at the head of the list does not cause subsequent entries to be skipped.
		expect(await runOn('Templates/b.md', ['Drafts', 'Templates'])).toBeUndefined();
	});

	it('treats a trailing slash on an exclusion path as equivalent', async () => {
		expect(await runOn('Drafts/a.md', ['Drafts/'])).toBeUndefined();
	});

	it('strips surrounding whitespace from exclusion entries', async () => {
		expect(await runOn('Drafts/a.md', ['  Drafts  '])).toBeUndefined();
	});

	it('ignores blank/whitespace-only exclusion entries instead of matching everything', async () => {
		// If an empty string accidentally matched as a prefix, every file would be excluded.
		// The guard `normEx && (...)` should keep blank entries inert.
		expect(await runOn('Notes/a.md', ['', '   '])).toMatch(UUID_RE);
	});

	it('combines blank entries with real ones without losing the real exclusion', async () => {
		expect(await runOn('Drafts/a.md', ['', 'Drafts', '   '])).toBeUndefined();
		expect(await runOn('Notes/b.md', ['', 'Drafts', '   '])).toMatch(UUID_RE);
	});

	it('"/" excludes every file (consistent with handleClearUIDsInFolder)', async () => {
		// EXPECTED behavior — currently fails. handleClearUIDsInFolder treats "/"
		// as "the whole vault"; the exclusion matcher should follow the same
		// convention so users get consistent semantics across settings.
		// Fix lives in commands.ts: special-case normEx === '/' to match every path.
		expect(await runOn('note.md', ['/'])).toBeUndefined();
		expect(await runOn('Notes/sub/deep.md', ['/'])).toBeUndefined();
		// Mixed with another entry, "/" should still short-circuit every file.
		expect(await runOn('Notes/b.md', ['/', 'Drafts'])).toBeUndefined();
	});
});

describe('settings that effectively exclude every file', () => {
	// There's no single "exclude the whole vault" setting — the toggle for that
	// is `autoGenerateUid: false`. These tests cover degenerate combinations
	// that produce the same effect, to make sure nothing crashes or surprises.

	it('per-file: scope=folder pointing at a non-existent path skips every file', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'a.md' },
				{ path: 'Notes/b.md' },
				{ path: 'Notes/sub/c.md' },
			],
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['NonExistent'],
			},
		});

		for (const file of app.files) {
			await handleAutoGenerateUid(app.plugin, file);
		}

		for (const path of ['a.md', 'Notes/b.md', 'Notes/sub/c.md']) {
			expect(app.frontmatterByPath.get(path)?.uid).toBeUndefined();
		}
		expect(app.processFrontMatter).not.toHaveBeenCalled();
	});

	it('per-file: scope=folder + that same folder excluded skips every file', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'Notes/a.md' },
				{ path: 'Notes/sub/b.md' },
				{ path: 'Other/c.md' },
			],
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
				autoGenerationExclusions: ['Notes'], // cancels out the scope
			},
		});

		for (const file of app.files) {
			await handleAutoGenerateUid(app.plugin, file);
		}

		for (const path of ['Notes/a.md', 'Notes/sub/b.md', 'Other/c.md']) {
			expect(app.frontmatterByPath.get(path)?.uid).toBeUndefined();
		}
	});

	it('bulk: handleAddMissingUidsInScope completes cleanly when every file is out of scope', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'a.md' },
				{ path: 'Notes/b.md' },
				{ path: 'Notes/sub/c.md' },
			],
			settings: {
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['NonExistent'],
			},
		});

		await expect(handleAddMissingUidsInScope(app.plugin)).resolves.toBeUndefined();

		for (const path of ['a.md', 'Notes/b.md', 'Notes/sub/c.md']) {
			expect(app.frontmatterByPath.get(path)?.uid).toBeUndefined();
		}
		expect(app.processFrontMatter).not.toHaveBeenCalled();
	});

	it('bulk: handleAddMissingUidsInScope completes cleanly when every file is excluded', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'Drafts/a.md' },
				{ path: 'Templates/b.md' },
				{ path: 'Templates/sub/c.md' },
			],
			settings: {
				autoGenerationScope: 'vault',
				autoGenerationExclusions: ['Drafts', 'Templates'],
			},
		});

		await expect(handleAddMissingUidsInScope(app.plugin)).resolves.toBeUndefined();

		for (const path of ['Drafts/a.md', 'Templates/b.md', 'Templates/sub/c.md']) {
			expect(app.frontmatterByPath.get(path)?.uid).toBeUndefined();
		}
		expect(app.processFrontMatter).not.toHaveBeenCalled();
	});
});

describe('parity — handleAutoGenerateUid vs handleAddMissingUidsInScope', () => {
	// Both functions implement the same "should this file be skipped?" decision.
	// One operates per-file (event-driven), the other in bulk. If the two ever
	// drift, users would see inconsistent behavior between auto-gen on file
	// create/open vs. the manual "Generate missing UIDs now" button.
	type Scenario = {
		name: string;
		settings: Partial<UIDGeneratorSettings>;
		files: string[];
	};

	const scenarios: Scenario[] = [
		{
			name: 'vault scope, no exclusions',
			settings: { autoGenerateUid: true, autoGenerationScope: 'vault' },
			files: ['root.md', 'Notes/a.md', 'Notes/sub/b.md', 'Drafts/c.md'],
		},
		{
			name: 'folder scope, no exclusions',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
			},
			files: ['root.md', 'Notes/a.md', 'Notes/sub/b.md', 'Other/c.md'],
		},
		{
			name: 'vault scope with exclusions',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'vault',
				autoGenerationExclusions: ['Drafts', 'Templates'],
			},
			files: ['Notes/a.md', 'Drafts/b.md', 'Templates/c.md', 'root.md'],
		},
		{
			name: 'folder scope plus exclusion under that scope',
			settings: {
				autoGenerateUid: true,
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
				autoGenerationExclusions: ['Notes/private'],
			},
			files: [
				'Notes/a.md',
				'Notes/private/secret.md',
				'Notes/public/ok.md',
				'Other/d.md',
			],
		},
	];

	async function runHandlerPerFile(s: Scenario): Promise<Set<string>> {
		const app = makeFakeApp({
			files: s.files.map((path) => ({ path })),
			settings: s.settings,
		});
		for (const file of app.files) {
			await handleAutoGenerateUid(app.plugin, file);
		}
		return collectUidPaths(app);
	}

	async function runBulk(s: Scenario): Promise<Set<string>> {
		const app = makeFakeApp({
			files: s.files.map((path) => ({ path })),
			settings: s.settings,
		});
		await handleAddMissingUidsInScope(app.plugin);
		return collectUidPaths(app);
	}

	function collectUidPaths(app: ReturnType<typeof makeFakeApp>): Set<string> {
		const out = new Set<string>();
		for (const [path, fm] of app.frontmatterByPath) {
			if (fm.uid) out.add(path);
		}
		return out;
	}

	for (const s of scenarios) {
		it(`makes the same skip/generate decisions: ${s.name}`, async () => {
			const perFile = await runHandlerPerFile(s);
			const bulk = await runBulk(s);
			expect(Array.from(bulk).sort()).toEqual(Array.from(perFile).sort());
			// Sanity check: at least one file should have been generated, otherwise
			// the scenario is degenerate and both functions trivially "agree".
			expect(perFile.size).toBeGreaterThan(0);
		});
	}
});

describe('handleAddMissingUidsInScope — bulk decision over many files', () => {
	it('adds UIDs only to in-scope, non-excluded, uid-less markdown files', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'Notes/a.md' }, // in scope, no uid → add
				{ path: 'Notes/b.md', frontmatter: { uid: 'keep-me' } }, // in scope, has uid → skip
				{ path: 'Notes/private/secret.md' }, // excluded → skip
				{ path: 'Drafts/c.md' }, // out of scope → skip
				{ path: 'Notes/sub/d.md' }, // in scope (nested) → add
				{ path: 'image.png', extension: 'png' }, // not markdown → skip (not in getMarkdownFiles)
			],
			settings: {
				autoGenerationScope: 'folder',
				autoGenerationFolders: ['Notes'],
				autoGenerationExclusions: ['Notes/private'],
			},
		});

		await handleAddMissingUidsInScope(app.plugin);

		const fm = (path: string) => app.frontmatterByPath.get(path) ?? {};
		expect(fm('Notes/a.md').uid).toMatch(UUID_RE);
		expect(fm('Notes/b.md').uid).toBe('keep-me');
		expect(fm('Notes/private/secret.md').uid).toBeUndefined();
		expect(fm('Drafts/c.md').uid).toBeUndefined();
		expect(fm('Notes/sub/d.md').uid).toMatch(UUID_RE);
	});

	it('uses the configured uidKey, not "uid"', async () => {
		const app = makeFakeApp({
			files: [{ path: 'Notes/a.md' }],
			settings: { uidKey: 'note-id', autoGenerationScope: 'vault' },
		});

		await handleAddMissingUidsInScope(app.plugin);

		const fm = app.frontmatterByPath.get('Notes/a.md') ?? {};
		expect(fm['note-id']).toMatch(UUID_RE);
		expect(fm.uid).toBeUndefined();
	});

	it('uses the configured generator (NanoID)', async () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md' }, { path: 'b.md' }],
			settings: {
				autoGenerationScope: 'vault',
				uidGenerator: 'nanoid',
				nanoidAlphabet: 'xyz',
				nanoidLength: 8,
			},
		});

		await handleAddMissingUidsInScope(app.plugin);

		for (const path of ['a.md', 'b.md']) {
			const fm = app.frontmatterByPath.get(path) ?? {};
			expect(fm.uid).toMatch(/^[xyz]{8}$/);
		}
	});
});

describe('handleClearUIDsInFolder — folder scoping', () => {
	it('removes uids only from files inside the target folder', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'Notes/a.md', frontmatter: { uid: 'a-uid' } },
				{ path: 'Notes/sub/b.md', frontmatter: { uid: 'b-uid' } },
				{ path: 'Other/c.md', frontmatter: { uid: 'c-uid' } },
			],
		});

		await handleClearUIDsInFolder(app.plugin, 'Notes');

		expect(app.frontmatterByPath.get('Notes/a.md')?.uid).toBeUndefined();
		expect(app.frontmatterByPath.get('Notes/sub/b.md')?.uid).toBeUndefined();
		expect(app.frontmatterByPath.get('Other/c.md')?.uid).toBe('c-uid');
	});

	it('clears uids from every file when folder path is "/"', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'a.md', frontmatter: { uid: 'a-uid' } },
				{ path: 'sub/b.md', frontmatter: { uid: 'b-uid' } },
			],
		});

		await handleClearUIDsInFolder(app.plugin, '/');

		expect(app.frontmatterByPath.get('a.md')?.uid).toBeUndefined();
		expect(app.frontmatterByPath.get('sub/b.md')?.uid).toBeUndefined();
	});

	it('does nothing when the folder does not exist', async () => {
		const app = makeFakeApp({
			files: [{ path: 'Notes/a.md', frontmatter: { uid: 'keep' } }],
		});

		await handleClearUIDsInFolder(app.plugin, 'NonExistent');

		expect(app.frontmatterByPath.get('Notes/a.md')?.uid).toBe('keep');
		expect(app.processFrontMatter).not.toHaveBeenCalled();
	});

	it('honours a custom uidKey when clearing', async () => {
		const app = makeFakeApp({
			files: [{ path: 'Notes/a.md', frontmatter: { 'note-id': 'gone', other: 'kept' } }],
			settings: { uidKey: 'note-id' },
		});

		await handleClearUIDsInFolder(app.plugin, 'Notes');

		const fm = app.frontmatterByPath.get('Notes/a.md') ?? {};
		expect(fm['note-id']).toBeUndefined();
		expect(fm.other).toBe('kept');
	});
});

describe('handleCopyTitleUid — format selection', () => {
	let clipboard: ReturnType<typeof installFakeClipboard>;

	beforeEach(() => {
		clipboard = installFakeClipboard();
	});

	afterEach(() => {
		clipboard.restore();
	});

	it('uses copyFormatString when the file has a uid', async () => {
		const app = makeFakeApp({
			files: [{ path: 'Notes/Hello.md', frontmatter: { uid: 'abc-123' } }],
			settings: { copyFormatString: '{title} :: {uid}' },
		});

		handleCopyTitleUid(app.plugin, app.files[0]);
		// The handler kicks off a fire-and-forget promise; flush microtasks
		await new Promise((r) => setImmediate(r));

		expect(clipboard.writes).toEqual(['Hello :: abc-123']);
	});

	it('uses copyFormatStringMissingUid when the file has no uid', async () => {
		const app = makeFakeApp({
			files: [{ path: 'Notes/Hello.md' }],
			settings: { copyFormatStringMissingUid: '{title} (no {uidKey})' },
		});

		handleCopyTitleUid(app.plugin, app.files[0]);
		await new Promise((r) => setImmediate(r));

		expect(clipboard.writes).toEqual(['Hello (no uid)']);
	});

	it('substitutes {uidKey} with the configured custom uidKey', async () => {
		const app = makeFakeApp({
			files: [{ path: 'Hello.md' }],
			settings: {
				uidKey: 'note-id',
				copyFormatStringMissingUid: '{title} — missing {uidKey}',
			},
		});

		handleCopyTitleUid(app.plugin, app.files[0]);
		await new Promise((r) => setImmediate(r));

		expect(clipboard.writes).toEqual(['Hello — missing note-id']);
	});
});

describe('handleGenerateUpdateUid — overwrites the active file uid', () => {
	it('replaces an existing uid with a fresh one', async () => {
		const app = makeFakeApp({
			files: [{ path: 'note.md', frontmatter: { uid: 'old-value' } }],
		});
		app.setActiveFile(app.files[0]);

		await handleGenerateUpdateUid(app.plugin, true);

		const fm = app.frontmatterByPath.get('note.md') ?? {};
		expect(fm.uid).toMatch(UUID_RE);
		expect(fm.uid).not.toBe('old-value');
	});

	it('creates a uid when none exists', async () => {
		const app = makeFakeApp({ files: [{ path: 'note.md' }] });
		app.setActiveFile(app.files[0]);

		await handleGenerateUpdateUid(app.plugin, true);

		expect(app.frontmatterByPath.get('note.md')?.uid).toMatch(UUID_RE);
	});

	it('is a no-op when there is no active markdown file', async () => {
		const app = makeFakeApp({ files: [{ path: 'note.md' }] });
		// active file deliberately not set

		await handleGenerateUpdateUid(app.plugin, true);

		expect(app.processFrontMatter).not.toHaveBeenCalled();
		expect(app.frontmatterByPath.get('note.md')?.uid).toBeUndefined();
	});
});

describe('handleCreateUidIfMissing — only sets when absent', () => {
	it('writes a new uid when the file has none', async () => {
		const app = makeFakeApp({ files: [{ path: 'note.md' }] });
		app.setActiveFile(app.files[0]);

		await handleCreateUidIfMissing(app.plugin);

		expect(app.frontmatterByPath.get('note.md')?.uid).toMatch(UUID_RE);
	});

	it('preserves an existing uid (no overwrite)', async () => {
		const app = makeFakeApp({
			files: [{ path: 'note.md', frontmatter: { uid: 'keep-me' } }],
		});
		app.setActiveFile(app.files[0]);

		await handleCreateUidIfMissing(app.plugin);

		expect(app.frontmatterByPath.get('note.md')?.uid).toBe('keep-me');
		// Short-circuits before processFrontMatter is invoked.
		expect(app.processFrontMatter).not.toHaveBeenCalled();
	});
});

describe('handleRemoveUid', () => {
	it('removes the uid from the active file when present', async () => {
		const app = makeFakeApp({
			files: [{ path: 'note.md', frontmatter: { uid: 'gone-soon' } }],
		});
		app.setActiveFile(app.files[0]);

		await handleRemoveUid(app.plugin);

		expect(app.frontmatterByPath.get('note.md')?.uid).toBeUndefined();
	});

	it('is a no-op when the active file has no uid', async () => {
		const app = makeFakeApp({ files: [{ path: 'note.md' }] });
		app.setActiveFile(app.files[0]);

		await handleRemoveUid(app.plugin);

		// removeUID is called but finds nothing to delete; frontmatter stays empty.
		expect(app.frontmatterByPath.get('note.md')?.uid).toBeUndefined();
	});

	it('removes the value at a custom uidKey only', async () => {
		const app = makeFakeApp({
			files: [
				{
					path: 'note.md',
					frontmatter: { 'note-id': 'gone', tag: 'kept' },
				},
			],
			settings: { uidKey: 'note-id' },
		});
		app.setActiveFile(app.files[0]);

		await handleRemoveUid(app.plugin);

		const fm = app.frontmatterByPath.get('note.md') ?? {};
		expect(fm['note-id']).toBeUndefined();
		expect(fm.tag).toBe('kept');
	});
});

describe('handleCopyUid — copies the raw uid (no formatting)', () => {
	let clipboard: ReturnType<typeof installFakeClipboard>;

	beforeEach(() => {
		clipboard = installFakeClipboard();
	});

	afterEach(() => {
		clipboard.restore();
	});

	it('writes only the uid value, not title or key', async () => {
		const app = makeFakeApp({
			files: [{ path: 'Hello.md', frontmatter: { uid: 'just-me' } }],
		});
		app.setActiveFile(app.files[0]);

		handleCopyUid(app.plugin);
		await new Promise((r) => setImmediate(r));

		expect(clipboard.writes).toEqual(['just-me']);
	});
});

describe('handleCopyTitlesAndUidsFromFolder — bulk copy with format selection', () => {
	let clipboard: ReturnType<typeof installFakeClipboard>;

	beforeEach(() => {
		clipboard = installFakeClipboard();
	});

	afterEach(() => {
		clipboard.restore();
	});

	it('mixes the two format strings per file based on uid presence', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'Notes/A.md', frontmatter: { uid: 'a-uid' } },
				{ path: 'Notes/B.md' },
				{ path: 'Notes/sub/C.md', frontmatter: { uid: 'c-uid' } },
				{ path: 'Other/D.md', frontmatter: { uid: 'd-uid' } },
			],
			settings: {
				copyFormatString: '{title}={uid}',
				copyFormatStringMissingUid: '{title}=missing',
			},
		});
		const folder = app.folders.get('Notes') as TFolder;

		await handleCopyTitlesAndUidsFromFolder(app.plugin, folder);

		expect(clipboard.writes).toHaveLength(1);
		const lines = clipboard.writes[0].split('\n').sort();
		expect(lines).toEqual(['A=a-uid', 'B=missing', 'C=c-uid'].sort());
	});

	it('copies the entire vault when folder path is "/"', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'A.md', frontmatter: { uid: 'a' } },
				{ path: 'sub/B.md', frontmatter: { uid: 'b' } },
			],
			settings: { copyFormatString: '{title}:{uid}' },
		});
		const root = app.folders.get('/') as TFolder;

		await handleCopyTitlesAndUidsFromFolder(app.plugin, root);

		expect(clipboard.writes).toHaveLength(1);
		const lines = clipboard.writes[0].split('\n').sort();
		expect(lines).toEqual(['A:a', 'B:b']);
	});

	it('does not write to the clipboard when the folder is empty', async () => {
		const app = makeFakeApp({
			files: [{ path: 'Other/A.md', frontmatter: { uid: 'a' } }],
		});
		// Build a folder reference that exists in the tree but has no md children.
		const empty = new TFolder();
		empty.path = 'NoMd';
		empty.name = 'NoMd';

		await handleCopyTitlesAndUidsFromFolder(app.plugin, empty);

		expect(clipboard.writes).toEqual([]);
	});
});

describe('handleCopyTitlesAndUidsForMultipleFiles', () => {
	let clipboard: ReturnType<typeof installFakeClipboard>;

	beforeEach(() => {
		clipboard = installFakeClipboard();
	});

	afterEach(() => {
		clipboard.restore();
	});

	it('joins per-file output with newline and uses the right format per file', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'A.md', frontmatter: { uid: 'a-uid' } },
				{ path: 'B.md' },
			],
			settings: {
				copyFormatString: '{title}={uid}',
				copyFormatStringMissingUid: '{title}=missing',
			},
		});

		await handleCopyTitlesAndUidsForMultipleFiles(app.plugin, app.files);

		expect(clipboard.writes).toEqual(['A=a-uid\nB=missing']);
	});

	it('does not write to the clipboard when the input array is empty', async () => {
		const app = makeFakeApp({ files: [] });

		await handleCopyTitlesAndUidsForMultipleFiles(app.plugin, []);

		expect(clipboard.writes).toEqual([]);
	});
});
