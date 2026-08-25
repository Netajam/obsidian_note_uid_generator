import { describe, expect, it } from 'vitest';
import { formatCopyString } from './format';
import type { UidContext } from '../../uid/model/context';

function makeCtx(uidKey = 'uid'): UidContext {
	return { settings: { uidKey } } as unknown as UidContext;
}

describe('formatCopyString', () => {
	it('substitutes title, uid, and uidKey', () => {
		expect(
			formatCopyString(makeCtx('note-id'), '{title} - {uidKey}: {uid}', 'My Note', 'abc123'),
		).toBe('My Note - note-id: abc123');
	});

	it('replaces missing uid with empty string', () => {
		expect(formatCopyString(makeCtx(), '{title} {uid}', 'Hello', null)).toBe('Hello ');
		expect(formatCopyString(makeCtx(), '{title} {uid}', 'Hello', undefined)).toBe('Hello ');
	});

	it('replaces missing title with empty string', () => {
		expect(formatCopyString(makeCtx(), '{title}-{uid}', '', 'x')).toBe('-x');
	});

	it('replaces every occurrence of a placeholder', () => {
		expect(formatCopyString(makeCtx(), '{uid}/{uid}', '', 'abc')).toBe('abc/abc');
	});

	it('returns the format string unchanged when no placeholders are present', () => {
		expect(formatCopyString(makeCtx(), 'no placeholders here', 't', 'u')).toBe(
			'no placeholders here',
		);
	});

	it('returns an empty string when the format string is empty', () => {
		expect(formatCopyString(makeCtx(), '', 'title', 'uid')).toBe('');
	});

	it('substitutes a {uid} literal inside the title (placeholders are processed in order)', () => {
		// {title} is replaced before {uid}, so a literal "{uid}" in the title
		// will itself be replaced on the next pass. Documenting current behavior.
		expect(formatCopyString(makeCtx(), '{title}', 'has {uid} inside', 'X')).toBe(
			'has X inside',
		);
	});
});
