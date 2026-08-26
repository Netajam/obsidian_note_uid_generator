import { describe, expect, it } from 'vitest';
import { findDuplicateUids, notesSharingUidWith, renewUids } from './duplicates';
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

describe('renewUids', () => {
	/** A group of three notes sharing one uid, oldest first. */
	function makeGroupOfThree() {
		return makeFakeApp({
			files: [
				{ path: 'original.md', frontmatter: { uid: 'AAA' }, ctime: 100 },
				{ path: 'copy.md', frontmatter: { uid: 'AAA' }, ctime: 200 },
				{ path: 'copy2.md', frontmatter: { uid: 'AAA' }, ctime: 300 },
			],
		});
	}

	it('renews the notes it is given and reports which took', async () => {
		const app = makeGroupOfThree();
		const [group] = findDuplicateUids(app.plugin);

		const renewed = await renewUids(app.plugin, group.notes.slice(1));

		expect(renewed.map(note => note.path)).toEqual(['copy.md', 'copy2.md']);
		expect(app.frontmatterByPath.get('original.md')?.uid).toBe('AAA');
		expect(app.frontmatterByPath.get('copy.md')?.uid).not.toBe('AAA');
		expect(findDuplicateUids(app.plugin)).toEqual([]);
	});

	it('renews just one note, leaving the rest of the group sharing', async () => {
		// The 'give this one a new uid' half of the report: a three-note group
		// is still a duplicate afterwards, with one fewer note in it.
		const app = makeGroupOfThree();
		const [group] = findDuplicateUids(app.plugin);

		await renewUids(app.plugin, [group.notes[2]]);

		expect(app.frontmatterByPath.get('copy2.md')?.uid).not.toBe('AAA');
		const [remaining] = findDuplicateUids(app.plugin);
		expect(remaining.notes.map(note => note.path)).toEqual(['original.md', 'copy.md']);
	});

	it('can renew the oldest note, when that is the one the user calls the copy', async () => {
		const app = makeGroupOfThree();
		const [group] = findDuplicateUids(app.plugin);

		await renewUids(app.plugin, [group.notes[0]]);

		expect(app.frontmatterByPath.get('original.md')?.uid).not.toBe('AAA');
		expect(app.frontmatterByPath.get('copy.md')?.uid).toBe('AAA');
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

		await renewUids(app.plugin, [group.notes[1]]);

		expect(app.uidIndex.owners('AAA')).toEqual(['original.md']);
	});

	it('does nothing when given nothing', async () => {
		const app = makeGroupOfThree();

		expect(await renewUids(app.plugin, [])).toEqual([]);
		expect(app.processFrontMatter).not.toHaveBeenCalled();
	});
});
