import { normalizePath } from 'obsidian';
import { DEFAULT_SETTINGS, UIDGeneratorSettings } from './settings';

export interface MigratedSettings {
	settings: UIDGeneratorSettings;
	/** True when a legacy field was rewritten and the result must be persisted. */
	needsSave: boolean;
}

/** Fills in defaults and repairs fields an older version may have stored with the wrong type. */
function normalizeSettings(settings: UIDGeneratorSettings): void {
	if (!Array.isArray(settings.autoGenerationExclusions)) settings.autoGenerationExclusions = [];
	if (!Array.isArray(settings.nanoidSeparators)) settings.nanoidSeparators = [];
	if (!Array.isArray(settings.autoGenerationFolders)) settings.autoGenerationFolders = [];
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
