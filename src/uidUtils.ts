import { TFile, Notice } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import { customAlphabet } from 'nanoid';
import { ulid } from 'ulid';
import UIDGenerator from './main';

// Cache the nanoid generator to avoid recreating on every call
let cachedNanoid: (() => string) | null = null;
let cachedAlphabet = '';
let cachedLength = 0;

function getNanoidGenerator(alphabet: string, length: number): () => string {
	if (cachedNanoid && cachedAlphabet === alphabet && cachedLength === length) {
		return cachedNanoid;
	}
	cachedAlphabet = alphabet;
	cachedLength = length;
	cachedNanoid = customAlphabet(alphabet, length);
	return cachedNanoid;
}

// --- Snowflake ID Generator ---
const SNOWFLAKE_NODE_ID_BITS = 10n;
const SNOWFLAKE_SEQUENCE_BITS = 12n;
const SNOWFLAKE_MAX_SEQUENCE = (1n << SNOWFLAKE_SEQUENCE_BITS) - 1n; // 4095
const SNOWFLAKE_MAX_NODE_ID = (1n << SNOWFLAKE_NODE_ID_BITS) - 1n;   // 1023
const SNOWFLAKE_NODE_ID_SHIFT = SNOWFLAKE_SEQUENCE_BITS;              // 12
const SNOWFLAKE_TIMESTAMP_SHIFT = SNOWFLAKE_NODE_ID_BITS + SNOWFLAKE_SEQUENCE_BITS; // 22

let snowflakeLastTimestamp = -1n;
let snowflakeSequence = 0n;

// Bounds the spin-wait when the per-ms sequence overflows. 4096 ids/ms is
// the absolute throughput; anything below that wraps within the same ms.
const SNOWFLAKE_SPIN_WAIT_MAX_MS = 5n;

function generateSnowflakeID(nodeId: number): string {
	const nodeIdBigInt = BigInt(nodeId) & SNOWFLAKE_MAX_NODE_ID;

	let timestamp = BigInt(Date.now());

	// Clock moved backwards (NTP, suspend/resume): bump the stored timestamp
	// forward by one ms instead of spinning. IDs stay monotonic across the
	// jump at the cost of a small future-skew until wall time catches up.
	if (timestamp < snowflakeLastTimestamp) {
		timestamp = snowflakeLastTimestamp + 1n;
		snowflakeSequence = 0n;
	} else if (timestamp === snowflakeLastTimestamp) {
		snowflakeSequence = (snowflakeSequence + 1n) & SNOWFLAKE_MAX_SEQUENCE;
		if (snowflakeSequence === 0n) {
			// Sequence exhausted for this ms — wait for the next ms, but bound
			// the spin so a stuck clock can't deadlock the plugin.
			const spinDeadline = timestamp + SNOWFLAKE_SPIN_WAIT_MAX_MS;
			while (timestamp <= snowflakeLastTimestamp && timestamp < spinDeadline) {
				timestamp = BigInt(Date.now());
			}
			if (timestamp <= snowflakeLastTimestamp) {
				timestamp = snowflakeLastTimestamp + 1n;
			}
		}
	} else {
		snowflakeSequence = 0n;
	}

	snowflakeLastTimestamp = timestamp;

	const id = (timestamp << SNOWFLAKE_TIMESTAMP_SHIFT)
		| (nodeIdBigInt << SNOWFLAKE_NODE_ID_SHIFT)
		| snowflakeSequence;

	return id.toString();
}

/** Test-only: reset Snowflake module state between cases. */
export function _resetSnowflakeState(): void {
	snowflakeLastTimestamp = -1n;
	snowflakeSequence = 0n;
}

/**
 * Resolves the Node ID auto-detect should produce for the given stored value.
 * Returns the new value to persist, or null if the stored value is already
 * correct (or no detection / fallback applies).
 *
 * - Desktop: returns the MAC-derived ID when it differs from `stored`.
 * - Mobile (no MAC): returns a random value in 1–1023 when `stored === 0`,
 *   so the random fallback is picked once and then preserved across reloads.
 *
 * The random range deliberately excludes 0: `stored === 0` is the sentinel
 * for "not yet picked". If the random pick could land on 0, it would be
 * indistinguishable from the unset state and re-roll on every plugin load,
 * breaking ID stability across sessions.
 *
 * The `detect` parameter is for unit testing. Production callers omit it
 * and get the real MAC-based detector.
 */
export function resolveAutoDetectedNodeId(
	stored: number,
	detect: () => number | null = detectNodeId,
): number | null {
	const detected = detect();
	if (detected !== null) {
		return detected !== stored ? detected : null;
	}
	if (stored === 0) {
		return Math.floor(Math.random() * 1023) + 1;
	}
	return null;
}

/**
 * Attempts to derive a stable 10-bit node ID (0-1023) from the machine's MAC address.
 * Available on Electron (desktop). Returns null on mobile or if detection fails.
 */
export function detectNodeId(): number | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const os = require('os');
		const interfaces = os.networkInterfaces();
		for (const name of Object.keys(interfaces)) {
			for (const iface of interfaces[name]) {
				if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
					const mac = iface.mac.replace(/:/g, '');
					let hash = 0;
					for (let i = 0; i < mac.length; i++) {
						hash = ((hash << 5) - hash + mac.charCodeAt(i)) | 0;
					}
					return Math.abs(hash) % 1024;
				}
			}
		}
	} catch {
		// os module not available (mobile)
	}
	return null;
}

/**
 * Generates a unique ID using UUID v4, NanoID, ULID, or Snowflake based on settings.
 * @param plugin The UIDGenerator plugin instance (for settings).
 */
const MAX_COLLISION_RETRIES = 10;

export function generateUID(plugin: UIDGenerator): string {
	for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
		const id = generateRawUID(plugin);
		if (!plugin.uidCache.has(id)) {
			return id;
		}
		console.warn(`[UIDGenerator] Collision detected, retrying (${attempt + 1}/${MAX_COLLISION_RETRIES})`);
	}
	// All retries exhausted — notify the user and return the duplicate as last resort
	const fallback = generateRawUID(plugin);
	console.error(`[UIDGenerator] Failed to generate unique ID after ${MAX_COLLISION_RETRIES} attempts.`);

	if (plugin.settings.uidGenerator === 'nanoid') {
		const { nanoidAlphabet, nanoidLength } = plugin.settings;
		const totalCombinations = Math.pow(nanoidAlphabet.length, nanoidLength);
		const combinationsStr = totalCombinations > 1e15
			? totalCombinations.toExponential(2)
			: totalCombinations.toLocaleString();
		new Notice(
			`Warning: Could not generate a unique ${plugin.settings.uidKey} after ${MAX_COLLISION_RETRIES} attempts. ` +
			`Current settings allow ~${combinationsStr} combinations (alphabet: ${nanoidAlphabet.length} chars, length: ${nanoidLength}). ` +
			`Consider increasing NanoID length or alphabet size.`,
			15000
		);
	} else {
		new Notice(
			`Warning: Could not generate a unique ${plugin.settings.uidKey} after ${MAX_COLLISION_RETRIES} attempts.`,
			15000
		);
	}
	return fallback;
}

function generateRawUID(plugin: UIDGenerator): string {
	if (plugin.settings.uidGenerator === 'snowflake') {
		const effective = plugin.settings.snowflakeNodeIdOverride ?? plugin.settings.snowflakeNodeId;
		return generateSnowflakeID(effective);
	}
	if (plugin.settings.uidGenerator === 'nanoid') {
		const { nanoidAlphabet, nanoidLength, nanoidSeparators } = plugin.settings;
		const nanoid = getNanoidGenerator(nanoidAlphabet, nanoidLength);
		let id = nanoid();

		if (nanoidSeparators && nanoidSeparators.length > 0) {
			const insertions = nanoidSeparators
				.filter(s => s.char && s.char.length === 1)
				.map(s => {
					let pos = s.position;
					if (pos < 0) {
						pos = nanoidLength + pos;
					}
					pos = Math.max(0, Math.min(nanoidLength, pos));
					return { char: s.char, position: pos };
				})
				.sort((a, b) => b.position - a.position);

			for (const { char, position } of insertions) {
				id = id.slice(0, position) + char + id.slice(position);
			}
		}

		return id;
	}
	if (plugin.settings.uidGenerator === 'ulid') {
		return ulid();
	}
	return uuidv4();
}

/**
 * Retrieves the UID for a given file, respecting the custom key setting.
 * @param plugin The UIDGenerator plugin instance.
 * @param file The TFile to check.
 * @returns The UID string or null if not found or on error.
 */
export function getUIDFromFile(plugin: UIDGenerator, file: TFile | null): string | null {
	if (!file) return null;
	try {
		const cache = plugin.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (!frontmatter) {
			return null;
		}
		const uidValue = frontmatter[plugin.settings.uidKey];
		// Ensure it's treated as a string, even if stored as number in YAML
		return typeof uidValue === 'string' || typeof uidValue === 'number' ? String(uidValue) : null;
	} catch (error) {
		console.error(`[UIDGenerator] Error reading metadata for ${file.path}:`, error);
		return null;
	}
}

/**
 * Sets or updates the UID property in a file's frontmatter.
 * @param plugin The UIDGenerator plugin instance.
 * @param file The TFile to modify.
 * @param uid The UID string to set.
 * @param overwrite If true, will overwrite an existing UID. If false (default), will only set if missing.
 * @returns Promise<boolean> - True if UID was set/modified, False otherwise.
 */
export async function setUID(plugin: UIDGenerator, file: TFile, uid: string, overwrite = false): Promise<boolean> {
	if (!file || !(file instanceof TFile) || file.extension !== 'md') {
		return false;
	}
	if (!uid) {
		console.warn(`[UIDGenerator] Attempted to set an empty UID for ${file.path}. Aborting.`);
		return false;
	}

	let uidWasSetOrOverwritten = false;
	const key = plugin.settings.uidKey;
	let initialUidExists = false; // Keep track if UID existed before processing

	try {
		await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const currentUid = frontmatter[key];
			initialUidExists = currentUid !== undefined && currentUid !== null && currentUid !== ''; // Check before potential modification

			if (initialUidExists && !overwrite) {
				uidWasSetOrOverwritten = false; // Explicitly false
				return; // Exit processor
			}

			// Only set the flag if the value actually changes or is newly set
			if (frontmatter[key] !== uid) {
				frontmatter[key] = uid;
				uidWasSetOrOverwritten = true;
			} else {
				// If overwrite is true but value is the same, we didn't *really* change it
				uidWasSetOrOverwritten = false;
			}


			// Optional cleanup
			if (key !== 'uid' && frontmatter.hasOwnProperty('uid')) delete frontmatter.uid;
			if (key !== 'Uid' && frontmatter.hasOwnProperty('Uid')) delete frontmatter.Uid;
			if (key !== 'UID' && frontmatter.hasOwnProperty('UID')) delete frontmatter.UID;
		});

		if (uidWasSetOrOverwritten) {
			plugin.uidCache.add(uid);
			plugin.uidPathMap.set(file.path, uid);
		}
		return uidWasSetOrOverwritten;

	} catch (error) {
		console.error(`[UIDGenerator] Error processing frontmatter for ${file.path} during setUID:`, error);
		new Notice(`Error setting ${key}. Check console.`, 5000);
		return false; // Indicate failure
	}
}

/**
 * Removes the UID property from a file's frontmatter, respecting the custom key.
 * @param plugin The UIDGenerator plugin instance.
 * @param file The TFile to modify.
 * @returns Promise<boolean> - True if a UID was found and removed, false otherwise.
 */
export async function removeUID(plugin: UIDGenerator, file: TFile): Promise<boolean> {
	if (!file || !(file instanceof TFile)) return false;
	let uidWasPresent = false;
	let removedUid: string | null = null;
	const key = plugin.settings.uidKey;
	try {
		await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (frontmatter.hasOwnProperty(key)) {
				removedUid = String(frontmatter[key]);
				uidWasPresent = true;
				delete frontmatter[key];
			}
		});
		if (uidWasPresent && removedUid) {
			plugin.uidCache.delete(removedUid);
			plugin.uidPathMap.delete(file.path);
		}
		return uidWasPresent;
	} catch (error) {
		console.error(`[UIDGenerator] Error processing frontmatter for ${file.path} during removal:`, error);
		new Notice(`Error removing ${key}. Check console.`, 5000);
		return false; // Indicate failure
	}
}

/**
 * Formats a string based on template and available data.
 * @param plugin The UIDGenerator plugin instance (needed for settings).
 * @param formatString The template string with placeholders {title}, {uid}, {uidKey}.
 * @param title The note title.
 * @param uid The actual UID value (or null/undefined if missing).
 * @returns The formatted string.
 */
export function formatCopyString(plugin: UIDGenerator, formatString: string, title: string, uid: string | null | undefined): string {
	let result = formatString;
	const uidKey = plugin.settings.uidKey;
	result = result.replace(/{title}/g, title || '');
	result = result.replace(/{uidKey}/g, uidKey || '');
	result = result.replace(/{uid}/g, uid || '');
	return result;
}
