/** The persisted shape of the plugin's settings, and the values a fresh install starts from. */
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
	folderToClear: '',
	copyFormatString: '{title} - {uidKey}: {uid}',
	copyFormatStringMissingUid: '{title} - No {uidKey}',
};
