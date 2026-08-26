import { describe, expect, it } from 'vitest';
import { findDuplicateUids, notesSharingUidWith, resolveDuplicateUids } from './duplicates';
import { makeFakeApp } from '../../tests/fakes/app';

/**
 * The case the plugin could not see before: a uid that was never generated
 * here, because it arrived with the note. These cover finding those notes,
 * and the repair that leaves exactly one of them holding the uid.
 */

describe('findDuplicateUids', () => {
	it('finds nothing when every note has its own uid', () => {
		const { plugin } = makeFakeApp({
			files: [
				{ path: 'a.md', frontmatter: { uid: 'AAA' } },
				{ path: 'b.md', frontmatter: { uid: 'BBB' } },
			],
		});

		expect(findDuplicateUids(plugin)).toEqual([]);
	});

	it('groups the notes that share a uid, oldest first', () => {
		const { plugin } = makeFakeApp({
			files: [
				{ path: 'copy.md', frontmatter: { uid: 'AAA' }, ctime: 200 },
				{ path: 'original.md', frontmatter: { uid: 'AAA' }, ctime: 100 },
				{ path: 'other.md', frontmatter: { uid: 'BBB' }, ctime: 150 },
			],
		});

		const groups = findDuplicateUids(plugin);

		expect(groups).toHaveLength(1);
		expect(groups[0].uid).toBe('AAA');
		expect(groups[0].notes.map(note => note.path)).toEqual(['original.md', 'copy.md']);
	});

	it('reports every duplicated uid, sorted', () => {
		const { plugin } = makeFakeApp({
			files: [
				{ path: 'a1.md', frontmatter: { uid: 'ZZZ' } },
				{ path: 'a2.md', frontmatter: { uid: 'ZZZ' } },
				{ path: 'b1.md', frontmatter: { uid: 'AAA' } },
				{ path: 'b2.md', frontmatter: { uid: 'AAA' } },
			],
		});

		expect(findDuplicateUids(plugin).map(group => group.uid)).toEqual(['AAA', 'ZZZ']);
	});

	it('ignores notes with no uid, however many of them there are', () => {
		const { plugin } = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: {} }, { path: 'b.md', frontmatter: {} }],
		});

		expect(findDuplicateUids(plugin)).toEqual([]);
	});

	it('reads the configured key', () => {
		const { plugin } = makeFakeApp({
			files: [
				{ path: 'a.md', frontmatter: { id: 'AAA', uid: 'shared-but-ignored' } },
				{ path: 'b.md', frontmatter: { id: 'BBB', uid: 'shared-but-ignored' } },
			],
			settings: { uidKey: 'id' },
		});

		expect(findDuplicateUids(plugin)).toEqual([]);
	});

	it('sees a duplicate the index never recorded', () => {
		// The scan reads the vault, not the index — so it catches drift rather
		// than repeating it.
		const { plugin } = makeFakeApp({
			files: [
				{ path: 'a.md', frontmatter: { uid: 'AAA' } },
				{ path: 'b.md', frontmatter: { uid: 'AAA' } },
			],
		});

		expect(findDuplicateUids(plugin)).toHaveLength(1);
	});
});

describe('notesSharingUidWith', () => {
	it('names the other note carrying the same uid', () => {
		const app = makeFakeApp({
			files: [{ path: 'copy.md', frontmatter: { uid: 'AAA' } }],
			indexed: { 'original.md': 'AAA', 'copy.md': 'AAA' },
		});

		expect(notesSharingUidWith(app.plugin, app.files[0])).toEqual(['original.md']);
	});

	it('never counts the note itself', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'AAA' } }],
			indexed: { 'a.md': 'AAA' },
		});

		expect(notesSharingUidWith(app.plugin, app.files[0])).toEqual([]);
	});

	it('says nothing about a note with no uid', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: {} }],
			indexed: { 'other.md': 'AAA' },
		});

		expect(notesSharingUidWith(app.plugin, app.files[0])).toEqual([]);
	});
});

describe('resolveDuplicateUids', () => {
	it('renews every note but the one kept', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'original.md', frontmatter: { uid: 'AAA' }, ctime: 100 },
				{ path: 'copy.md', frontmatter: { uid: 'AAA' }, ctime: 200 },
				{ path: 'copy2.md', frontmatter: { uid: 'AAA' }, ctime: 300 },
			],
		});
		const [group] = findDuplicateUids(app.plugin);

		expect(await resolveDuplicateUids(app.plugin, group, group.notes[0])).toBe(2);

		expect(app.frontmatterByPath.get('original.md')?.uid).toBe('AAA');
		expect(app.frontmatterByPath.get('copy.md')?.uid).not.toBe('AAA');
		expect(app.frontmatterByPath.get('copy2.md')?.uid).not.toBe('AAA');
		expect(findDuplicateUids(app.plugin)).toEqual([]);
	});

	it('keeps whichever note the user picked, not just the oldest', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'original.md', frontmatter: { uid: 'AAA' }, ctime: 100 },
				{ path: 'copy.md', frontmatter: { uid: 'AAA' }, ctime: 200 },
			],
		});
		const [group] = findDuplicateUids(app.plugin);
		const copy = group.notes[group.notes.length - 1];
		expect(copy.path).toBe('copy.md');

		await resolveDuplicateUids(app.plugin, group, copy);

		expect(app.frontmatterByPath.get('copy.md')?.uid).toBe('AAA');
		expect(app.frontmatterByPath.get('original.md')?.uid).not.toBe('AAA');
	});

	it('never hands out a uid the vault still holds', async () => {
		const app = makeFakeApp({
			files: [
				{ path: 'original.md', frontmatter: { uid: 'AAA' }, ctime: 100 },
				{ path: 'copy.md', frontmatter: { uid: 'AAA' }, ctime: 200 },
			],
			indexed: { 'original.md': 'AAA', 'copy.md': 'AAA' },
		});
		const [group] = findDuplicateUids(app.plugin);

		await resolveDuplicateUids(app.plugin, group, group.notes[0]);

		expect(app.uidIndex.owners('AAA')).toEqual(['original.md']);
	});
});
