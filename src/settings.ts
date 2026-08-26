import { normalizePath } from 'obsidian';

/**
 * The persisted settings contract: the shape stored on disk, the values a
 * fresh install starts from, and how whatever an older version wrote becomes
 * current, well-formed settings.
 *
 * Migration lives here rather than beside the loader because it is defined
 * entirely by this shape — every rule below is "field X used to be written
 * like Y".
 */
export interface UIDGeneratorSettings {
	uidKey: string;
	autoGenerateUid: boolean;
	uidGenerator: 'uuid' | 'nanoid' | 'ulid' | 'snowflake';
	nanoidLength: number;
	nanoidAlphabet: string;
	nanoidSeparators: Array<{ char: string; position: number }>;
	snowflakeNodeId: number;                       // machine-detected (or random mobile fallback)
	snowflakeNodeIdOverride: number | null;        // when set, overrides the machine value
	snowflakeAutoDetectNodeId?: boolean;           // legacy — kept only for migration from earlier PR builds
	autoGenerationScope: 'vault' | 'folder';
	autoGenerationFolder: string;   // kept for migration from older versions
	autoGenerationFolders: string[];
	autoGenerationExclusions: string[];
	/** What to do when a note turns up carrying a uid another note already has. */
	duplicateUidCheck: 'off' | 'notify' | 'regenerate';
	folderToClear: string;
	copyFormatString: string;
	copyFormatStringMissingUid: string;
}

export const DEFAULT_SETTINGS: UIDGeneratorSettings = {
	uidKey: 'uid',
	autoGenerateUid: false,
	uidGenerator: 'uuid',
	nanoidLength: 21,
	nanoidAlphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
	nanoidSeparators: [],
	snowflakeNodeId: 0,
	snowflakeNodeIdOverride: null,
	autoGenerationScope: 'vault',
	autoGenerationFolder: '',
	autoGenerationFolders: [],
	autoGenerationExclusions: [],
	duplicateUidCheck: 'notify',
	folderToClear: '',
	copyFormatString: '{title} - {uidKey}: {uid}',
	copyFormatStringMissingUid: '{title} - No {uidKey}',
};

export interface MigratedSettings {
	settings: UIDGeneratorSettings;
	/** True when a legacy field was rewritten and the result must be persisted. */
	needsSave: boolean;
}

/**
 * A copy of the list, or an empty one when an older version stored something
 * that is not a list at all.
 *
 * The copy is the point: `Object.assign` below shares whichever list instance
 * it took, so without this a migration that appends a folder would append it
 * to `DEFAULT_SETTINGS` itself, and every later load would start from the
 * previous user's data.
 */
function toOwnList<T>(value: T[]): T[] {
	return Array.isArray(value) ? [...value] : [];
}

/** Fills in defaults and repairs fields an older version may have stored with the wrong type. */
function normalizeSettings(settings: UIDGeneratorSettings): void {
	settings.autoGenerationExclusions = toOwnList(settings.autoGenerationExclusions);
	settings.nanoidSeparators = toOwnList(settings.nanoidSeparators).map(separator => ({ ...separator }));
	settings.autoGenerationFolders = toOwnList(settings.autoGenerationFolders);
	settings.copyFormatString = settings.copyFormatString || DEFAULT_SETTINGS.copyFormatString;
	settings.copyFormatStringMissingUid = settings.copyFormatStringMissingUid || DEFAULT_SETTINGS.copyFormatStringMissingUid;
}

/**
 * One-shot migration from the legacy single-folder string to the array.
 * Clears the old field so subsequent loads no-op without rewriting settings.
 */
function migrateAutoGenerationFolder(settings: UIDGeneratorSettings): boolean {
	if (!settings.autoGenerationFolder || settings.autoGenerationFolder.trim() === '') return false;

	const oldFolder = normalizePath(settings.autoGenerationFolder.trim());
	if (oldFolder && !settings.autoGenerationFolders.includes(oldFolder)) {
		settings.autoGenerationFolders.push(oldFolder);
	}
	settings.autoGenerationFolder = '';
	return true;
}

/**
 * One-shot migration from the legacy Snowflake auto-detect toggle to the
 * override field. Earlier PR builds stored a manual Node ID in
 * `snowflakeNodeId` with `snowflakeAutoDetectNodeId === false`; carry that
 * intent forward as a custom override so the user's pick survives.
 */
function migrateSnowflakeAutoDetect(settings: UIDGeneratorSettings): boolean {
	if (typeof settings.snowflakeAutoDetectNodeId !== 'boolean') return false;

	if (
		settings.snowflakeAutoDetectNodeId === false
		&& settings.snowflakeNodeIdOverride === null
		&& settings.snowflakeNodeId > 0
	) {
		settings.snowflakeNodeIdOverride = settings.snowflakeNodeId;
		settings.snowflakeNodeId = 0; // re-detect on next load
	}
	delete settings.snowflakeAutoDetectNodeId;
	return true;
}

/** Turns whatever was persisted on disk into current, well-formed settings. */
export function migrateSettings(stored: Partial<UIDGeneratorSettings> | null | undefined): MigratedSettings {
	const settings: UIDGeneratorSettings = Object.assign({}, DEFAULT_SETTINGS, stored);
	normalizeSettings(settings);

	// Both run: neither short-circuits the other.
	const folderMigrated = migrateAutoGenerationFolder(settings);
	const snowflakeMigrated = migrateSnowflakeAutoDetect(settings);

	return { settings, needsSave: folderMigrated || snowflakeMigrated };
}
