import { describe, expect, it, vi, afterEach } from 'vitest';
import * as obsidian from 'obsidian';
import { handleDuplicateUidCheck } from './duplicateWatch';
import { makeFakeApp } from '../../../tests/fakes/app';

/**
 * The three answers the setting offers, each pinned to the thing it must not
 * do: 'off' must not notice, 'notify' must not write, and 'regenerate' must
 * write only when the uid really is somebody else's.
 */

function spyOnNotices(): { messages: string[]; restore: () => void } {
	const messages: string[] = [];
	const spy = vi.spyOn(obsidian, 'Notice').mockImplementation(function (message: string) {
		messages.push(message);
		return {} as obsidian.Notice;
	} as never);
	return { messages, restore: () => spy.mockRestore() };
}

let notices: { messages: string[]; restore: () => void } | null = null;

afterEach(() => {
	notices?.restore();
	notices = null;
});

/** A copied note: same uid as one already in the vault, and both are indexed. */
function makeCopiedNote(policy: 'off' | 'notify' | 'regenerate') {
	return makeFakeApp({
		files: [{ path: 'copy.md', frontmatter: { uid: 'AAA' } }],
		settings: { duplicateUidCheck: policy },
		indexed: { 'original.md': 'AAA', 'copy.md': 'AAA' },
	});
}

describe('handleDuplicateUidCheck', () => {
	it('does nothing at all when the check is off', async () => {
		const app = makeCopiedNote('off');
		notices = spyOnNotices();

		await handleDuplicateUidCheck(app.plugin, app.files[0]);

		expect(notices.messages).toEqual([]);
		expect(app.processFrontMatter).not.toHaveBeenCalled();
	});

	it('notifies without touching the note', async () => {
		const app = makeCopiedNote('notify');
		notices = spyOnNotices();

		await handleDuplicateUidCheck(app.plugin, app.files[0]);

		expect(notices.messages).toHaveLength(1);
		expect(notices.messages[0]).toContain('original.md');
		expect(app.frontmatterByPath.get('copy.md')?.uid).toBe('AAA');
		expect(app.processFrontMatter).not.toHaveBeenCalled();
	});

	it('counts the company rather than listing it when there is more than one', async () => {
		const app = makeFakeApp({
			files: [{ path: 'copy.md', frontmatter: { uid: 'AAA' } }],
			settings: { duplicateUidCheck: 'notify' },
			indexed: { 'a.md': 'AAA', 'b.md': 'AAA', 'copy.md': 'AAA' },
		});
		notices = spyOnNotices();

		await handleDuplicateUidCheck(app.plugin, app.files[0]);

		expect(notices.messages[0]).toContain('2 other notes');
	});

	it('renews the newcomer, leaving the note it was copied from alone', async () => {
		const app = makeCopiedNote('regenerate');
		notices = spyOnNotices();

		await handleDuplicateUidCheck(app.plugin, app.files[0]);

		expect(app.frontmatterByPath.get('copy.md')?.uid).not.toBe('AAA');
		expect(app.uidIndex.owners('AAA')).toEqual(['original.md']);
	});

	it('leaves a note whose uid is its own alone', async () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: { uid: 'AAA' } }],
			settings: { duplicateUidCheck: 'regenerate' },
			indexed: { 'a.md': 'AAA' },
		});
		notices = spyOnNotices();

		await handleDuplicateUidCheck(app.plugin, app.files[0]);

		expect(app.frontmatterByPath.get('a.md')?.uid).toBe('AAA');
		expect(notices.messages).toEqual([]);
	});

	it('leaves a note with no uid alone — that is auto-generation\'s business', async () => {
		const app = makeFakeApp({
			files: [{ path: 'a.md', frontmatter: {} }],
			settings: { duplicateUidCheck: 'regenerate' },
			indexed: { 'other.md': 'AAA' },
		});
		notices = spyOnNotices();

		await handleDuplicateUidCheck(app.plugin, app.files[0]);

		expect(app.frontmatterByPath.get('a.md')?.uid).toBeUndefined();
		expect(notices.messages).toEqual([]);
	});
});
