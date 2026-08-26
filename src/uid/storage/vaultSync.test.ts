import { describe, expect, it } from 'vitest';
import { TFolder } from 'obsidian';
import { buildUidIndex, forgetFile, syncUidFromFrontmatter } from './vaultSync';
import { makeFakeApp } from '../../../tests/fakes/app';

/**
 * The index is what collision detection trusts: a uid missing from it is a uid
 * the generator will happily hand out twice. These tests pin the two halves of
 * that promise — that a rebuild sees the whole vault, and that every vault
 * event leaves the index describing what the notes actually say.
 */

describe('buildUidIndex', () => {
	it('collects the uid of every note that has one', () => {
		const { plugin, uidIndex } = makeFakeApp({
			files: [
				{ path: 'a.md', frontmatter: { uid: 'AAA' } },
				{ path: 'notes/b.md', frontmatter: { uid: 'BBB' } },
				{ path: 'notes/c.md', frontmatter: {} },
			],
		});

		buildUidIndex(plugin);

		expect(uidIndex.owners('AAA')).toEqual(['a.md']);
		expect(uidIndex.owners('BBB')).toEqual(['notes/b.md']);
		expect(uidIndex.uidAt('notes/c.md')).toBeNull();
	});

	it('records both notes when two of them share a uid', () => {
		const { plugin, uidIndex } = makeFakeApp({
			files: [
				{ path: 'original.md', frontmatter: { uid: 'AAA' } },
				{ path: 'copy.md', frontmatter: { uid: 'AAA' } },
			],
		});

		buildUidIndex(plugin);

		expect(uidIndex.owners('AAA')).toEqual(['copy.md', 'original.md']);
	});

	it('reads the configured key, not the word "uid"', () => {
		const { plugin, uidIndex } = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { id: 'AAA', uid: 'ignored' } }],
			settings: { uidKey: 'id' },
		});

		buildUidIndex(plugin);

		expect(uidIndex.has('AAA')).toBe(true);
		expect(uidIndex.has('ignored')).toBe(false);
	});

	it('starts from scratch, so a rebuild after a key change drops the old entries', () => {
		const { plugin, uidIndex } = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'AAA' } }],
			indexed: { 'gone.md': 'STALE' },
		});

		buildUidIndex(plugin);

		expect(uidIndex.has('AAA')).toBe(true);
		expect(uidIndex.has('STALE')).toBe(false);
	});

	it('takes a uid stored as a YAML number', () => {
		const { plugin, uidIndex } = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 12345 } }],
		});

		buildUidIndex(plugin);

		expect(uidIndex.owners('12345')).toEqual(['a.md']);
	});
});

describe('syncUidFromFrontmatter', () => {
	it('adds a uid that appeared — a note synced in already carrying one', () => {
		const app = makeFakeApp({ files: [{ path: 'a.md', frontmatter: { uid: 'AAA' } }] });

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.uidIndex.owners('AAA')).toEqual(['a.md']);
	});

	it('swaps both entries when the uid was edited by hand', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'NEW' } }],
			indexed: { 'a.md': 'OLD' },
		});

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.uidIndex.uidAt('a.md')).toBe('NEW');
		expect(app.uidIndex.has('OLD')).toBe(false);
	});

	it('leaves a uid a second note still carries in place', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'NEW' } }],
			indexed: { 'a.md': 'SHARED', 'twin.md': 'SHARED' },
		});

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.uidIndex.owners('SHARED')).toEqual(['twin.md']);
	});

	it('evicts when the uid was deleted from the frontmatter', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: {} }],
			indexed: { 'a.md': 'OLD' },
		});

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.uidIndex.has('OLD')).toBe(false);
		expect(app.uidIndex.uidAt('a.md')).toBeNull();
	});

	it('leaves an unchanged note alone', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'AAA' } }],
			indexed: { 'a.md': 'AAA' },
		});

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.uidIndex.owners('AAA')).toEqual(['a.md']);
	});

	it('touches nothing for a vault entry that is not a note', () => {
		const app = makeFakeApp({
			files: [{ path: 'Notes/a.md', frontmatter: { uid: 'AAA' } }],
			indexed: { 'Notes/a.md': 'AAA' },
		});
		const folder = app.folders.get('Notes') as TFolder;

		syncUidFromFrontmatter(app.plugin, folder);

		expect(app.uidIndex.owners('AAA')).toEqual(['Notes/a.md']);
	});
});

describe('forgetFile', () => {
	it('evicts a deleted file by path, since its metadata is already gone', () => {
		const app = makeFakeApp({
			files: [],
			indexed: { 'a.md': 'AAA', 'b.md': 'BBB' },
		});

		forgetFile(app.plugin, 'a.md');

		expect(app.uidIndex.has('AAA')).toBe(false);
		expect(app.uidIndex.owners('BBB')).toEqual(['b.md']);
	});

	it('keeps a uid the deleted file shared with a note still in the vault', () => {
		const app = makeFakeApp({
			files: [],
			indexed: { 'copy.md': 'SHARED', 'original.md': 'SHARED' },
		});

		forgetFile(app.plugin, 'copy.md');

		expect(app.uidIndex.owners('SHARED')).toEqual(['original.md']);
	});

	it('does nothing for a path it never indexed', () => {
		const app = makeFakeApp({
			files: [],
			indexed: { 'a.md': 'AAA' },
		});

		forgetFile(app.plugin, 'never-seen.md');

		expect(app.uidIndex.owners('AAA')).toEqual(['a.md']);
	});
});
