import { describe, expect, it } from 'vitest';
import { TFolder } from 'obsidian';
import { buildUidCache, forgetFile, syncUidFromFrontmatter } from './cache';
import { makeFakeApp } from '../../../tests/fakes/app';

/**
 * The cache is what collision detection trusts: a uid missing from it is a uid
 * the generator will happily hand out twice. These tests pin the two halves of
 * that promise — that a rebuild sees the whole vault, and that every vault
 * event keeps `uidCache` and `uidPathMap` in step.
 */

describe('buildUidCache', () => {
	it('collects the uid of every note that has one', () => {
		const { plugin } = makeFakeApp({
			files: [
				{ path: 'a.md', frontmatter: { uid: 'AAA' } },
				{ path: 'notes/b.md', frontmatter: { uid: 'BBB' } },
				{ path: 'notes/c.md', frontmatter: {} },
			],
		});

		buildUidCache(plugin);

		expect(plugin.uidCache).toEqual(new Set(['AAA', 'BBB']));
		expect(plugin.uidPathMap.get('a.md')).toBe('AAA');
		expect(plugin.uidPathMap.get('notes/b.md')).toBe('BBB');
		expect(plugin.uidPathMap.has('notes/c.md')).toBe(false);
	});

	it('reads the configured key, not the word "uid"', () => {
		const { plugin } = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { id: 'AAA', uid: 'ignored' } }],
			settings: { uidKey: 'id' },
		});

		buildUidCache(plugin);

		expect(plugin.uidCache).toEqual(new Set(['AAA']));
	});

	it('starts from scratch, so a rebuild after a key change drops the old entries', () => {
		const { plugin } = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'AAA' } }],
			uidCache: new Set(['STALE']),
			uidPathMap: new Map([['gone.md', 'STALE']]),
		});

		buildUidCache(plugin);

		expect(plugin.uidCache).toEqual(new Set(['AAA']));
		expect(plugin.uidPathMap.has('gone.md')).toBe(false);
	});

	it('takes a uid stored as a YAML number', () => {
		const { plugin } = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 12345 } }],
		});

		buildUidCache(plugin);

		expect(plugin.uidCache).toEqual(new Set(['12345']));
	});
});

describe('syncUidFromFrontmatter', () => {
	it('adds a uid that appeared — a note synced in already carrying one', () => {
		const app = makeFakeApp({ files: [{ path: 'a.md', frontmatter: { uid: 'AAA' } }] });

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.plugin.uidCache).toEqual(new Set(['AAA']));
		expect(app.plugin.uidPathMap.get('a.md')).toBe('AAA');
	});

	it('swaps both entries when the uid was edited by hand', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'NEW' } }],
			uidCache: new Set(['OLD']),
			uidPathMap: new Map([['a.md', 'OLD']]),
		});

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.plugin.uidCache).toEqual(new Set(['NEW']));
		expect(app.plugin.uidPathMap.get('a.md')).toBe('NEW');
	});

	it('evicts when the uid was deleted from the frontmatter', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: {} }],
			uidCache: new Set(['OLD']),
			uidPathMap: new Map([['a.md', 'OLD']]),
		});

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.plugin.uidCache.size).toBe(0);
		expect(app.plugin.uidPathMap.has('a.md')).toBe(false);
	});

	it('leaves an unchanged note alone', () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'AAA' } }],
			uidCache: new Set(['AAA']),
			uidPathMap: new Map([['a.md', 'AAA']]),
		});

		syncUidFromFrontmatter(app.plugin, app.files[0]);

		expect(app.plugin.uidCache).toEqual(new Set(['AAA']));
		expect(app.plugin.uidPathMap.get('a.md')).toBe('AAA');
	});

	it('touches nothing for a vault entry that is not a note', () => {
		const app = makeFakeApp({
			files: [{ path: 'Notes/a.md', frontmatter: { uid: 'AAA' } }],
			uidCache: new Set(['AAA']),
			uidPathMap: new Map([['Notes/a.md', 'AAA']]),
		});
		const folder = app.folders.get('Notes') as TFolder;

		syncUidFromFrontmatter(app.plugin, folder);

		expect(app.plugin.uidCache).toEqual(new Set(['AAA']));
		expect(app.plugin.uidPathMap.get('Notes/a.md')).toBe('AAA');
	});
});

describe('forgetFile', () => {
	it('evicts a deleted file by path, since its metadata is already gone', () => {
		const app = makeFakeApp({
			files: [],
			uidCache: new Set(['AAA', 'BBB']),
			uidPathMap: new Map([['a.md', 'AAA'], ['b.md', 'BBB']]),
		});

		forgetFile(app.plugin, 'a.md');

		expect(app.plugin.uidCache).toEqual(new Set(['BBB']));
		expect(app.plugin.uidPathMap.has('a.md')).toBe(false);
	});

	it('does nothing for a path it never cached', () => {
		const app = makeFakeApp({
			files: [],
			uidCache: new Set(['AAA']),
			uidPathMap: new Map([['a.md', 'AAA']]),
		});

		forgetFile(app.plugin, 'never-seen.md');

		expect(app.plugin.uidCache).toEqual(new Set(['AAA']));
		expect(app.plugin.uidPathMap.get('a.md')).toBe('AAA');
	});
});
