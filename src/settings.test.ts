import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrateSettings, type UIDGeneratorSettings } from './settings';

/**
 * `migrateSettings` runs against whatever the last version wrote, on every
 * load, before anything else reads settings. These tests are the record of
 * what "whatever was persisted" is allowed to be.
 */

describe('migrateSettings — a fresh install', () => {
	it('returns the defaults for null, undefined and an empty object', () => {
		for (const stored of [null, undefined, {}]) {
			const { settings, needsSave } = migrateSettings(stored);
			expect(settings).toEqual(DEFAULT_SETTINGS);
			expect(needsSave).toBe(false);
		}
	});

	it('keeps stored values and fills only what is missing', () => {
		const { settings, needsSave } = migrateSettings({ uidKey: 'id', nanoidLength: 8 });

		expect(settings.uidKey).toBe('id');
		expect(settings.nanoidLength).toBe(8);
		expect(settings.uidGenerator).toBe(DEFAULT_SETTINGS.uidGenerator);
		expect(needsSave).toBe(false);
	});
});

describe('migrateSettings — repairing malformed values', () => {
	it('replaces list fields that were stored as something other than a list', () => {
		const { settings } = migrateSettings({
			autoGenerationExclusions: 'Archive' as unknown as string[],
			nanoidSeparators: null as unknown as [],
			autoGenerationFolders: 42 as unknown as string[],
		});

		expect(settings.autoGenerationExclusions).toEqual([]);
		expect(settings.nanoidSeparators).toEqual([]);
		expect(settings.autoGenerationFolders).toEqual([]);
	});

	it('treats an empty copy format as "use the default", not "copy nothing"', () => {
		const { settings } = migrateSettings({ copyFormatString: '', copyFormatStringMissingUid: '' });

		expect(settings.copyFormatString).toBe(DEFAULT_SETTINGS.copyFormatString);
		expect(settings.copyFormatStringMissingUid).toBe(DEFAULT_SETTINGS.copyFormatStringMissingUid);
	});

	it('repairs in memory without asking for a save — the next write flushes it', () => {
		const { needsSave } = migrateSettings({ nanoidSeparators: null as unknown as [] });

		expect(needsSave).toBe(false);
	});
});

describe('migrateSettings — the legacy single auto-generation folder', () => {
	it('moves the old string into the folder list and asks to persist', () => {
		const { settings, needsSave } = migrateSettings({ autoGenerationFolder: 'Notes/Daily' });

		expect(settings.autoGenerationFolders).toEqual(['Notes/Daily']);
		expect(settings.autoGenerationFolder).toBe('');
		expect(needsSave).toBe(true);
	});

	it('normalizes the path it carries over', () => {
		const { settings } = migrateSettings({ autoGenerationFolder: '  Notes//Daily/  ' });

		expect(settings.autoGenerationFolders).toEqual(['Notes/Daily']);
	});

	it('appends to folders already in the list', () => {
		const { settings } = migrateSettings({
			autoGenerationFolder: 'Notes',
			autoGenerationFolders: ['Journal'],
		});

		expect(settings.autoGenerationFolders).toEqual(['Journal', 'Notes']);
	});

	it('does not add a folder the list already holds, but still clears the old field', () => {
		const { settings, needsSave } = migrateSettings({
			autoGenerationFolder: 'Notes',
			autoGenerationFolders: ['Notes'],
		});

		expect(settings.autoGenerationFolders).toEqual(['Notes']);
		expect(settings.autoGenerationFolder).toBe('');
		expect(needsSave).toBe(true);
	});

	it('leaves an absent or blank legacy field alone', () => {
		for (const autoGenerationFolder of ['', '   ']) {
			const { settings, needsSave } = migrateSettings({ autoGenerationFolder });

			expect(settings.autoGenerationFolders).toEqual([]);
			expect(needsSave).toBe(false);
		}
	});

	it('runs a second time as a no-op — the migration is one-shot', () => {
		const first = migrateSettings({ autoGenerationFolder: 'Notes' });
		const second = migrateSettings(first.settings);

		expect(second.settings.autoGenerationFolders).toEqual(['Notes']);
		expect(second.needsSave).toBe(false);
	});
});

describe('migrateSettings — the legacy Snowflake auto-detect toggle', () => {
	it('carries a manually chosen Node ID forward as an override', () => {
		const { settings, needsSave } = migrateSettings({
			snowflakeAutoDetectNodeId: false,
			snowflakeNodeId: 77,
			snowflakeNodeIdOverride: null,
		});

		expect(settings.snowflakeNodeIdOverride).toBe(77);
		expect(settings.snowflakeNodeId).toBe(0); // re-detected on this load
		expect(settings.snowflakeAutoDetectNodeId).toBeUndefined();
		expect(needsSave).toBe(true);
	});

	it('drops the toggle without touching the ids when auto-detect was on', () => {
		const { settings, needsSave } = migrateSettings({
			snowflakeAutoDetectNodeId: true,
			snowflakeNodeId: 77,
		});

		expect(settings.snowflakeNodeId).toBe(77);
		expect(settings.snowflakeNodeIdOverride).toBeNull();
		expect(settings.snowflakeAutoDetectNodeId).toBeUndefined();
		expect(needsSave).toBe(true);
	});

	it('never overwrites an override the user already set', () => {
		const { settings } = migrateSettings({
			snowflakeAutoDetectNodeId: false,
			snowflakeNodeId: 77,
			snowflakeNodeIdOverride: 5,
		});

		expect(settings.snowflakeNodeIdOverride).toBe(5);
		expect(settings.snowflakeNodeId).toBe(77);
	});

	it('leaves settings written before the toggle existed alone', () => {
		const { settings, needsSave } = migrateSettings({ snowflakeNodeId: 77 });

		expect(settings.snowflakeNodeId).toBe(77);
		expect(needsSave).toBe(false);
	});
});

describe('migrateSettings — the two migrations are independent', () => {
	it('applies both when both legacy fields are present', () => {
		const { settings, needsSave } = migrateSettings({
			autoGenerationFolder: 'Notes',
			snowflakeAutoDetectNodeId: false,
			snowflakeNodeId: 77,
			snowflakeNodeIdOverride: null,
		});

		expect(settings.autoGenerationFolders).toEqual(['Notes']);
		expect(settings.snowflakeNodeIdOverride).toBe(77);
		expect(needsSave).toBe(true);
	});
});

describe('migrateSettings — the result is the caller\'s alone', () => {
	it('leaves DEFAULT_SETTINGS untouched when a migration writes to a list', () => {
		migrateSettings({ autoGenerationFolder: 'Notes' });

		expect(DEFAULT_SETTINGS.autoGenerationFolders).toEqual([]);
	});

	it('hands back lists that are not shared with DEFAULT_SETTINGS', () => {
		const { settings } = migrateSettings({});

		settings.autoGenerationFolders.push('Notes');
		settings.autoGenerationExclusions.push('Archive');
		settings.nanoidSeparators.push({ char: '-', position: 4 });

		expect(DEFAULT_SETTINGS.autoGenerationFolders).toEqual([]);
		expect(DEFAULT_SETTINGS.autoGenerationExclusions).toEqual([]);
		expect(DEFAULT_SETTINGS.nanoidSeparators).toEqual([]);
	});

	it('does not write back into the object it was handed', () => {
		const stored: Partial<UIDGeneratorSettings> = {
			autoGenerationFolder: 'Notes',
			autoGenerationFolders: ['Journal'],
		};

		migrateSettings(stored);

		expect(stored.autoGenerationFolders).toEqual(['Journal']);
		expect(stored.autoGenerationFolder).toBe('Notes');
	});
});
