import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile } from 'obsidian';

import {
	generateUID,
	formatCopyString,
	getUIDFromFile,
	setUID,
	removeUID,
	_resetSnowflakeState,
} from './uidUtils';
import type UIDGenerator from './main';

type Settings = {
	uidKey: string;
	uidGenerator: 'uuid' | 'nanoid' | 'ulid' | 'snowflake';
	nanoidLength: number;
	nanoidAlphabet: string;
	nanoidSeparators: Array<{ char: string; position: number }>;
	snowflakeNodeId?: number;
	snowflakeNodeIdOverride?: number | null;
};

function makePlugin(
	overrides: Partial<Settings> = {},
	cache: Set<string> = new Set(),
): UIDGenerator {
	const settings: Settings = {
		uidKey: 'uid',
		uidGenerator: 'uuid',
		nanoidLength: 21,
		nanoidAlphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
		nanoidSeparators: [],
		...overrides,
	};
	return { settings, uidCache: cache } as unknown as UIDGenerator;
}

type Frontmatter = Record<string, unknown>;

function makeFile(path: string, extension = 'md'): TFile {
	const file = new TFile();
	file.path = path;
	file.extension = extension;
	return file;
}

interface PluginHarness {
	plugin: UIDGenerator;
	frontmatter: Frontmatter;
	uidCache: Set<string>;
	uidPathMap: Map<string, string>;
	processFrontMatter: ReturnType<typeof vi.fn>;
}

function makePluginWithApp(opts: {
	uidKey?: string;
	frontmatter?: Frontmatter;
	getFileCache?: (file: TFile) => unknown;
	processFrontMatterImpl?: (
		file: TFile,
		fn: (fm: Frontmatter) => void,
	) => Promise<void>;
} = {}): PluginHarness {
	const fm: Frontmatter = opts.frontmatter ?? {};
	const uidCache = new Set<string>();
	const uidPathMap = new Map<string, string>();

	const defaultProcess = async (
		_file: TFile,
		fn: (frontmatter: Frontmatter) => void,
	) => {
		fn(fm);
	};
	const processFrontMatter = vi.fn(opts.processFrontMatterImpl ?? defaultProcess);

	const plugin = {
		settings: {
			uidKey: opts.uidKey ?? 'uid',
			uidGenerator: 'uuid',
			nanoidLength: 21,
			nanoidAlphabet: 'abc',
			nanoidSeparators: [],
		},
		uidCache,
		uidPathMap,
		app: {
			metadataCache: {
				getFileCache: opts.getFileCache ?? (() => ({ frontmatter: fm })),
			},
			fileManager: {
				processFrontMatter,
			},
		},
	} as unknown as UIDGenerator;

	return { plugin, frontmatter: fm, uidCache, uidPathMap, processFrontMatter };
}

describe('formatCopyString', () => {
	it('substitutes title, uid, and uidKey', () => {
		const plugin = makePlugin({ uidKey: 'note-id' });
		expect(
			formatCopyString(plugin, '{title} - {uidKey}: {uid}', 'My Note', 'abc123'),
		).toBe('My Note - note-id: abc123');
	});

	it('replaces missing uid with empty string', () => {
		const plugin = makePlugin();
		expect(formatCopyString(plugin, '{title} {uid}', 'Hello', null)).toBe('Hello ');
		expect(formatCopyString(plugin, '{title} {uid}', 'Hello', undefined)).toBe('Hello ');
	});

	it('replaces missing title with empty string', () => {
		const plugin = makePlugin();
		expect(formatCopyString(plugin, '{title}-{uid}', '', 'x')).toBe('-x');
	});

	it('replaces every occurrence of a placeholder', () => {
		const plugin = makePlugin();
		expect(formatCopyString(plugin, '{uid}/{uid}', '', 'abc')).toBe('abc/abc');
	});

	it('returns the format string unchanged when no placeholders are present', () => {
		const plugin = makePlugin();
		expect(formatCopyString(plugin, 'no placeholders here', 't', 'u')).toBe(
			'no placeholders here',
		);
	});

	it('returns an empty string when the format string is empty', () => {
		const plugin = makePlugin();
		expect(formatCopyString(plugin, '', 'title', 'uid')).toBe('');
	});

	it('substitutes a {uid} literal inside the title (placeholders are processed in order)', () => {
		// {title} is replaced before {uid}, so a literal "{uid}" in the title
		// will itself be replaced on the next pass. Documenting current behavior.
		const plugin = makePlugin();
		expect(formatCopyString(plugin, '{title}', 'has {uid} inside', 'X')).toBe(
			'has X inside',
		);
	});
});

describe('generateUID — generator selection', () => {
	it('returns a valid UUID v4 by default', () => {
		const id = generateUID(makePlugin({ uidGenerator: 'uuid' }));
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
	});

	it('returns a 26-char Crockford Base32 ULID when configured', () => {
		const id = generateUID(makePlugin({ uidGenerator: 'ulid' }));
		expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
	});

	it('returns a NanoID with the configured length and alphabet', () => {
		const id = generateUID(
			makePlugin({ uidGenerator: 'nanoid', nanoidAlphabet: 'abc', nanoidLength: 10 }),
		);
		expect(id).toHaveLength(10);
		expect(id).toMatch(/^[abc]+$/);
	});
});

describe('generateUID — NanoID separator injection', () => {
	const constantNanoid = (length: number) => ({
		uidGenerator: 'nanoid' as const,
		nanoidAlphabet: 'a',
		nanoidLength: length,
	});

	it('injects a separator at a positive position', () => {
		const plugin = makePlugin({
			...constantNanoid(6),
			nanoidSeparators: [{ char: '-', position: 3 }],
		});
		expect(generateUID(plugin)).toBe('aaa-aaa');
	});

	it('injects a separator at a negative position (counted from the end)', () => {
		const plugin = makePlugin({
			...constantNanoid(6),
			nanoidSeparators: [{ char: '_', position: -2 }],
		});
		expect(generateUID(plugin)).toBe('aaaa_aa');
	});

	it('clamps positions outside the valid range', () => {
		const plugin = makePlugin({
			...constantNanoid(4),
			nanoidSeparators: [
				{ char: 'L', position: -100 },
				{ char: 'R', position: 100 },
			],
		});
		expect(generateUID(plugin)).toBe('LaaaaR');
	});

	it('applies multiple separators in the correct order', () => {
		const plugin = makePlugin({
			...constantNanoid(6),
			nanoidSeparators: [
				{ char: '-', position: 2 },
				{ char: '-', position: 4 },
			],
		});
		expect(generateUID(plugin)).toBe('aa-aa-aa');
	});

	it('ignores separators with empty or multi-char strings', () => {
		const plugin = makePlugin({
			...constantNanoid(4),
			nanoidSeparators: [
				{ char: '', position: 2 },
				{ char: 'xx', position: 1 },
			],
		});
		expect(generateUID(plugin)).toBe('aaaa');
	});

	it('inserts a separator at position 0 (prepended)', () => {
		const plugin = makePlugin({
			...constantNanoid(4),
			nanoidSeparators: [{ char: '<', position: 0 }],
		});
		expect(generateUID(plugin)).toBe('<aaaa');
	});

	it('inserts a separator at position == nanoidLength (appended)', () => {
		const plugin = makePlugin({
			...constantNanoid(4),
			nanoidSeparators: [{ char: '>', position: 4 }],
		});
		expect(generateUID(plugin)).toBe('aaaa>');
	});

	it('inserts a separator at position == -nanoidLength (wraps to position 0)', () => {
		const plugin = makePlugin({
			...constantNanoid(4),
			nanoidSeparators: [{ char: '|', position: -4 }],
		});
		expect(generateUID(plugin)).toBe('|aaaa');
	});

	it('handles two separators sharing the same position', () => {
		// Both have position 2; sort is stable on ties, so they're inserted at the
		// same slice index in iteration order. Each insertion shifts the next.
		const plugin = makePlugin({
			...constantNanoid(4),
			nanoidSeparators: [
				{ char: 'X', position: 2 },
				{ char: 'Y', position: 2 },
			],
		});
		expect(generateUID(plugin)).toMatch(/^aa(XY|YX)aa$/);
	});
});

describe('generateUID — collision handling', () => {
	it('returns the duplicate after exhausting retries when no unique id is possible', () => {
		const cache = new Set<string>(['a']);
		const plugin = makePlugin(
			{ uidGenerator: 'nanoid', nanoidAlphabet: 'a', nanoidLength: 1 },
			cache,
		);
		expect(generateUID(plugin)).toBe('a');
	});

	it('returns a non-cached id when one is available', () => {
		const cache = new Set<string>(); // empty cache, no collisions possible
		const plugin = makePlugin(
			{ uidGenerator: 'nanoid', nanoidAlphabet: 'ab', nanoidLength: 8 },
			cache,
		);
		const id = generateUID(plugin);
		expect(id).toMatch(/^[ab]{8}$/);
		expect(cache.has(id)).toBe(false);
	});
});

describe('generateUID — NanoID generator caching', () => {
	it('reflects an alphabet change immediately (cache is invalidated)', () => {
		const plugin = makePlugin({
			uidGenerator: 'nanoid',
			nanoidAlphabet: 'a',
			nanoidLength: 6,
		});
		expect(generateUID(plugin)).toBe('aaaaaa');

		plugin.settings.nanoidAlphabet = 'b';
		expect(generateUID(plugin)).toBe('bbbbbb');
	});

	it('reflects a length change immediately (cache is invalidated)', () => {
		const plugin = makePlugin({
			uidGenerator: 'nanoid',
			nanoidAlphabet: 'a',
			nanoidLength: 4,
		});
		expect(generateUID(plugin)).toHaveLength(4);

		plugin.settings.nanoidLength = 12;
		expect(generateUID(plugin)).toHaveLength(12);
	});
});

describe('getUIDFromFile', () => {
	it('returns null when file is null', () => {
		const { plugin } = makePluginWithApp();
		expect(getUIDFromFile(plugin, null)).toBeNull();
	});

	it('returns null when the file has no frontmatter', () => {
		const { plugin } = makePluginWithApp({ getFileCache: () => ({}) });
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBeNull();
	});

	it('returns null when the configured key is missing', () => {
		const { plugin } = makePluginWithApp({
			uidKey: 'note-id',
			frontmatter: { other: 'value' },
		});
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBeNull();
	});

	it('returns the value when the key is present as a string', () => {
		const { plugin } = makePluginWithApp({
			frontmatter: { uid: 'abc-123' },
		});
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBe('abc-123');
	});

	it('coerces numeric YAML values to a string', () => {
		const { plugin } = makePluginWithApp({
			frontmatter: { uid: 12345 },
		});
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBe('12345');
	});

	it('returns null for unsupported value types (boolean, array, object)', () => {
		const cases: Frontmatter[] = [
			{ uid: true },
			{ uid: [1, 2, 3] },
			{ uid: { nested: 'thing' } },
		];
		for (const fm of cases) {
			const { plugin } = makePluginWithApp({ frontmatter: fm });
			expect(getUIDFromFile(plugin, makeFile('note.md'))).toBeNull();
		}
	});

	it('swallows errors thrown by the metadata cache and returns null', () => {
		const { plugin } = makePluginWithApp({
			getFileCache: () => {
				throw new Error('boom');
			},
		});
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBeNull();
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});

	it('coerces a numeric 0 to the string "0" (does not treat it as missing)', () => {
		const { plugin } = makePluginWithApp({ frontmatter: { uid: 0 } });
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBe('0');
	});

	it('returns the empty string when the value is an empty string', () => {
		// Empty string is technically "present"; the function returns it verbatim.
		// Documenting current behavior — callers must check for falsy themselves.
		const { plugin } = makePluginWithApp({ frontmatter: { uid: '' } });
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBe('');
	});

	it('returns null when the value is explicitly null', () => {
		const { plugin } = makePluginWithApp({ frontmatter: { uid: null } });
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBeNull();
	});

	it('returns null when getFileCache returns null', () => {
		const { plugin } = makePluginWithApp({ getFileCache: () => null });
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBeNull();
	});

	it('reads the configured custom uidKey instead of "uid"', () => {
		const { plugin } = makePluginWithApp({
			uidKey: 'note-id',
			frontmatter: { uid: 'wrong', 'note-id': 'right' },
		});
		expect(getUIDFromFile(plugin, makeFile('note.md'))).toBe('right');
	});
});

describe('setUID', () => {
	it('returns false for a null file', async () => {
		const { plugin } = makePluginWithApp();
		expect(await setUID(plugin, null as unknown as TFile, 'x')).toBe(false);
	});

	it('returns false for a non-TFile object', async () => {
		const { plugin, processFrontMatter } = makePluginWithApp();
		const fakeFile = { path: 'note.md', extension: 'md' } as unknown as TFile;
		expect(await setUID(plugin, fakeFile, 'x')).toBe(false);
		expect(processFrontMatter).not.toHaveBeenCalled();
	});

	it('returns false for non-markdown files', async () => {
		const { plugin, processFrontMatter } = makePluginWithApp();
		expect(await setUID(plugin, makeFile('image.png', 'png'), 'x')).toBe(false);
		expect(processFrontMatter).not.toHaveBeenCalled();
	});

	it('returns false when the UID is empty', async () => {
		const { plugin, processFrontMatter } = makePluginWithApp();
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await setUID(plugin, makeFile('note.md'), '')).toBe(false);
		expect(processFrontMatter).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('sets the UID and updates caches when the key is missing', async () => {
		const { plugin, frontmatter, uidCache, uidPathMap } = makePluginWithApp({
			frontmatter: {},
		});
		const file = makeFile('note.md');
		expect(await setUID(plugin, file, 'new-uid')).toBe(true);
		expect(frontmatter.uid).toBe('new-uid');
		expect(uidCache.has('new-uid')).toBe(true);
		expect(uidPathMap.get('note.md')).toBe('new-uid');
	});

	it('does not overwrite an existing UID when overwrite=false', async () => {
		const { plugin, frontmatter, uidCache, uidPathMap } = makePluginWithApp({
			frontmatter: { uid: 'existing' },
		});
		const file = makeFile('note.md');
		expect(await setUID(plugin, file, 'new-uid')).toBe(false);
		expect(frontmatter.uid).toBe('existing');
		expect(uidCache.has('new-uid')).toBe(false);
		expect(uidPathMap.has('note.md')).toBe(false);
	});

	it('overwrites an existing UID when overwrite=true and the value differs', async () => {
		const { plugin, frontmatter, uidCache } = makePluginWithApp({
			frontmatter: { uid: 'old' },
		});
		const file = makeFile('note.md');
		expect(await setUID(plugin, file, 'new', true)).toBe(true);
		expect(frontmatter.uid).toBe('new');
		expect(uidCache.has('new')).toBe(true);
	});

	it('reports no change when overwrite=true but the value is identical', async () => {
		const { plugin, uidCache } = makePluginWithApp({
			frontmatter: { uid: 'same' },
		});
		const file = makeFile('note.md');
		expect(await setUID(plugin, file, 'same', true)).toBe(false);
		expect(uidCache.has('same')).toBe(false);
	});

	it('removes legacy uid/Uid/UID keys when a custom key is configured', async () => {
		const { plugin, frontmatter } = makePluginWithApp({
			uidKey: 'note-id',
			frontmatter: { uid: 'a', Uid: 'b', UID: 'c' },
		});
		const file = makeFile('note.md');
		expect(await setUID(plugin, file, 'fresh')).toBe(true);
		expect(frontmatter['note-id']).toBe('fresh');
		expect(frontmatter.uid).toBeUndefined();
		expect(frontmatter.Uid).toBeUndefined();
		expect(frontmatter.UID).toBeUndefined();
	});

	it('returns false and logs when processFrontMatter rejects', async () => {
		const { plugin } = makePluginWithApp({
			processFrontMatterImpl: async () => {
				throw new Error('disk error');
			},
		});
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await setUID(plugin, makeFile('note.md'), 'x')).toBe(false);
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});

	it('treats an existing empty-string UID as missing and writes the new value', async () => {
		const { plugin, frontmatter, uidCache } = makePluginWithApp({
			frontmatter: { uid: '' },
		});
		expect(await setUID(plugin, makeFile('note.md'), 'fresh')).toBe(true);
		expect(frontmatter.uid).toBe('fresh');
		expect(uidCache.has('fresh')).toBe(true);
	});

	it('treats an existing null UID as missing and writes the new value', async () => {
		const { plugin, frontmatter } = makePluginWithApp({
			frontmatter: { uid: null },
		});
		expect(await setUID(plugin, makeFile('note.md'), 'fresh')).toBe(true);
		expect(frontmatter.uid).toBe('fresh');
	});

	it('preserves the active uid key while still cleaning Uid/UID legacy variants', async () => {
		const { plugin, frontmatter } = makePluginWithApp({
			uidKey: 'uid',
			frontmatter: { Uid: 'legacy-mixed', UID: 'legacy-upper' },
		});
		expect(await setUID(plugin, makeFile('note.md'), 'new-uid')).toBe(true);
		expect(frontmatter.uid).toBe('new-uid');
		expect(frontmatter.Uid).toBeUndefined();
		expect(frontmatter.UID).toBeUndefined();
	});

	it('rejects non-md extensions like canvas', async () => {
		const { plugin, processFrontMatter } = makePluginWithApp();
		expect(await setUID(plugin, makeFile('board.canvas', 'canvas'), 'x')).toBe(false);
		expect(processFrontMatter).not.toHaveBeenCalled();
	});

	it('rejects files with no extension', async () => {
		const { plugin, processFrontMatter } = makePluginWithApp();
		expect(await setUID(plugin, makeFile('weird', ''), 'x')).toBe(false);
		expect(processFrontMatter).not.toHaveBeenCalled();
	});
});

describe('removeUID', () => {
	it('returns false for a null file', async () => {
		const { plugin } = makePluginWithApp();
		expect(await removeUID(plugin, null as unknown as TFile)).toBe(false);
	});

	it('returns false for a non-TFile object', async () => {
		const { plugin, processFrontMatter } = makePluginWithApp();
		const fakeFile = { path: 'note.md', extension: 'md' } as unknown as TFile;
		expect(await removeUID(plugin, fakeFile)).toBe(false);
		expect(processFrontMatter).not.toHaveBeenCalled();
	});

	it('returns false when the UID key is not present', async () => {
		const { plugin, frontmatter } = makePluginWithApp({
			frontmatter: { other: 'thing' },
		});
		expect(await removeUID(plugin, makeFile('note.md'))).toBe(false);
		expect(frontmatter.other).toBe('thing');
	});

	it('removes the UID and updates caches when present', async () => {
		const { plugin, frontmatter, uidCache, uidPathMap } = makePluginWithApp({
			frontmatter: { uid: 'gone' },
		});
		uidCache.add('gone');
		uidPathMap.set('note.md', 'gone');

		expect(await removeUID(plugin, makeFile('note.md'))).toBe(true);
		expect(frontmatter.uid).toBeUndefined();
		expect(uidCache.has('gone')).toBe(false);
		expect(uidPathMap.has('note.md')).toBe(false);
	});

	it('returns false and logs when processFrontMatter rejects', async () => {
		const { plugin } = makePluginWithApp({
			processFrontMatterImpl: async () => {
				throw new Error('disk error');
			},
		});
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await removeUID(plugin, makeFile('note.md'))).toBe(false);
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});

	it('removes the value at the configured custom uidKey', async () => {
		const { plugin, frontmatter } = makePluginWithApp({
			uidKey: 'note-id',
			frontmatter: { 'note-id': 'gone', uid: 'untouched' },
		});
		expect(await removeUID(plugin, makeFile('note.md'))).toBe(true);
		expect(frontmatter['note-id']).toBeUndefined();
		expect(frontmatter.uid).toBe('untouched');
	});

	it('removes a falsy numeric UID and cleans up the cache via its string form', async () => {
		const { plugin, frontmatter, uidCache, uidPathMap } = makePluginWithApp({
			frontmatter: { uid: 0 },
		});
		uidCache.add('0');
		uidPathMap.set('note.md', '0');

		expect(await removeUID(plugin, makeFile('note.md'))).toBe(true);
		expect(frontmatter.uid).toBeUndefined();
		expect(uidCache.has('0')).toBe(false);
		expect(uidPathMap.has('note.md')).toBe(false);
	});
});

describe('Snowflake ID generator', () => {
	beforeEach(() => {
		_resetSnowflakeState();
	});

	function snowflakePlugin(nodeId: number): UIDGenerator {
		return makePlugin({ uidGenerator: 'snowflake', snowflakeNodeId: nodeId });
	}

	// Layout (lsb → msb): 12 bits sequence, 10 bits node, 41 bits timestamp.
	function decode(id: string): { timestamp: bigint; nodeId: bigint; sequence: bigint } {
		const big = BigInt(id);
		return {
			sequence: big & 0xfffn,
			nodeId: (big >> 12n) & 0x3ffn,
			timestamp: big >> 22n,
		};
	}

	it('produces a numeric string', () => {
		const id = generateUID(snowflakePlugin(7));
		expect(id).toMatch(/^\d+$/);
	});

	it('encodes the configured node ID into the middle bits', () => {
		const id = generateUID(snowflakePlugin(42));
		expect(decode(id).nodeId).toBe(42n);
	});

	it('uses the override Node ID when set, ignoring the machine value', () => {
		const plugin = makePlugin({
			uidGenerator: 'snowflake',
			snowflakeNodeId: 5,
			snowflakeNodeIdOverride: 99,
		});
		expect(decode(generateUID(plugin)).nodeId).toBe(99n);
	});

	it('falls back to the machine Node ID when the override is null', () => {
		const plugin = makePlugin({
			uidGenerator: 'snowflake',
			snowflakeNodeId: 5,
			snowflakeNodeIdOverride: null,
		});
		expect(decode(generateUID(plugin)).nodeId).toBe(5n);
	});

	it('clamps node IDs above the 10-bit max (1023) into range', () => {
		// nodeId 2048 has bit 11 set; after & 1023 it should land at 0.
		const id = generateUID(snowflakePlugin(2048));
		expect(decode(id).nodeId).toBe(0n);
	});

	it('increments the sequence within the same millisecond', () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
		try {
			const a = decode(generateUID(snowflakePlugin(1)));
			const b = decode(generateUID(snowflakePlugin(1)));
			const c = decode(generateUID(snowflakePlugin(1)));
			expect(a.timestamp).toBe(b.timestamp);
			expect(b.timestamp).toBe(c.timestamp);
			expect(b.sequence).toBe(a.sequence + 1n);
			expect(c.sequence).toBe(b.sequence + 1n);
		} finally {
			vi.restoreAllMocks();
		}
	});

	it('resets the sequence when the timestamp advances', () => {
		const nowSpy = vi.spyOn(Date, 'now');
		nowSpy.mockReturnValue(1_700_000_000_000);
		try {
			generateUID(snowflakePlugin(1));
			generateUID(snowflakePlugin(1));
			nowSpy.mockReturnValue(1_700_000_000_001);
			const next = decode(generateUID(snowflakePlugin(1)));
			expect(next.sequence).toBe(0n);
			expect(next.timestamp).toBe(BigInt(1_700_000_000_001) & ((1n << 41n) - 1n));
		} finally {
			vi.restoreAllMocks();
		}
	});

	it('survives a backwards clock jump without deadlocking', () => {
		const nowSpy = vi.spyOn(Date, 'now');
		nowSpy.mockReturnValue(1_700_000_000_010);
		try {
			const before = decode(generateUID(snowflakePlugin(3)));
			// Clock jumps backwards (NTP / suspend-resume).
			nowSpy.mockReturnValue(1_700_000_000_000);
			const after = decode(generateUID(snowflakePlugin(3)));
			// Generator must keep moving forward, not spin or regress.
			expect(after.timestamp).toBeGreaterThan(before.timestamp);
		} finally {
			vi.restoreAllMocks();
		}
	});

	it('produces strictly increasing IDs across many calls in one ms', () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
		try {
			const ids = Array.from({ length: 200 }, () => BigInt(generateUID(snowflakePlugin(1))));
			for (let i = 1; i < ids.length; i++) {
				expect(ids[i] > ids[i - 1]).toBe(true);
			}
		} finally {
			vi.restoreAllMocks();
		}
	});
});
