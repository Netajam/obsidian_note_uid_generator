import { describe, expect, it } from 'vitest';
import { UidIndex } from './uidIndex';

/**
 * The index has one job a `Set` of uids could not do: remember how many notes
 * put a uid there. Everything below is a variation on that — a uid stays
 * "taken" while any note still carries it, and stops being taken the moment
 * the last one lets go.
 */

describe('UidIndex', () => {
	it('reports a uid as taken once a note carries it', () => {
		const index = new UidIndex();
		index.set('a.md', 'AAA');

		expect(index.has('AAA')).toBe(true);
		expect(index.uidAt('a.md')).toBe('AAA');
		expect(index.owners('AAA')).toEqual(['a.md']);
	});

	it('knows nothing about a path it was never told', () => {
		const index = new UidIndex();

		expect(index.has('AAA')).toBe(false);
		expect(index.uidAt('a.md')).toBeNull();
		expect(index.owners('AAA')).toEqual([]);
	});

	it('lists both notes when two of them carry the same uid', () => {
		const index = new UidIndex();
		index.set('original.md', 'SHARED');
		index.set('copy.md', 'SHARED');

		expect(index.owners('SHARED')).toEqual(['copy.md', 'original.md']);
	});

	it('keeps a shared uid taken after one of its notes lets go', () => {
		const index = new UidIndex();
		index.set('original.md', 'SHARED');
		index.set('copy.md', 'SHARED');

		index.forget('copy.md');

		// The bug a plain Set had: 'SHARED' would have been handed out again
		// while original.md was still carrying it.
		expect(index.has('SHARED')).toBe(true);
		expect(index.owners('SHARED')).toEqual(['original.md']);
	});

	it('frees a uid once the last note carrying it lets go', () => {
		const index = new UidIndex();
		index.set('a.md', 'AAA');
		index.forget('a.md');

		expect(index.has('AAA')).toBe(false);
		expect(index.owners('AAA')).toEqual([]);
	});

	it('moves a note from its old uid to its new one', () => {
		const index = new UidIndex();
		index.set('a.md', 'OLD');
		index.set('a.md', 'NEW');

		expect(index.has('OLD')).toBe(false);
		expect(index.uidAt('a.md')).toBe('NEW');
		expect(index.owners('NEW')).toEqual(['a.md']);
	});

	it('re-recording the same pair leaves one owner, not two', () => {
		const index = new UidIndex();
		index.set('a.md', 'AAA');
		index.set('a.md', 'AAA');

		expect(index.owners('AAA')).toEqual(['a.md']);
	});

	it('ignores a path it does not hold', () => {
		const index = new UidIndex();
		index.set('a.md', 'AAA');

		index.forget('never-seen.md');

		expect(index.owners('AAA')).toEqual(['a.md']);
	});

	it('empties completely on clear', () => {
		const index = new UidIndex();
		index.set('a.md', 'AAA');
		index.set('b.md', 'AAA');

		index.clear();

		expect(index.has('AAA')).toBe(false);
		expect(index.uidAt('a.md')).toBeNull();
	});
});
