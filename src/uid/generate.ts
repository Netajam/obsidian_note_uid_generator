import { Notice } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import { ulid } from 'ulid';
import { UidContext } from './model/context';
import { generateNanoID } from './generators/nanoid';
import { generateSnowflakeID } from './generators/snowflake';
import { detectNodeId, resolveAutoDetectedNodeId } from './generators/nodeId';

const MAX_COLLISION_RETRIES = 10;
const COLLISION_NOTICE_MS = 15000;

/** Runs the configured algorithm once, without checking the collision cache. */
function generateRawUID(ctx: UidContext): string {
	const { uidGenerator } = ctx.settings;

	if (uidGenerator === 'snowflake') {
		const { snowflakeNodeIdOverride, snowflakeNodeId } = ctx.settings;
		return generateSnowflakeID(snowflakeNodeIdOverride ?? snowflakeNodeId);
	}
	if (uidGenerator === 'nanoid') {
		const { nanoidAlphabet, nanoidLength, nanoidSeparators } = ctx.settings;
		return generateNanoID(nanoidAlphabet, nanoidLength, nanoidSeparators);
	}
	if (uidGenerator === 'ulid') {
		return ulid();
	}
	return uuidv4();
}

/** Explains an exhausted retry budget, spelling out the NanoID keyspace when that is the cause. */
function warnCollisionExhausted(ctx: UidContext): void {
	if (ctx.settings.uidGenerator !== 'nanoid') {
		new Notice(
			`Warning: Could not generate a unique ${ctx.settings.uidKey} after ${MAX_COLLISION_RETRIES} attempts.`,
			COLLISION_NOTICE_MS,
		);
		return;
	}

	const { nanoidAlphabet, nanoidLength } = ctx.settings;
	const totalCombinations = Math.pow(nanoidAlphabet.length, nanoidLength);
	const combinationsStr = totalCombinations > 1e15
		? totalCombinations.toExponential(2)
		: totalCombinations.toLocaleString();
	new Notice(
		`Warning: Could not generate a unique ${ctx.settings.uidKey} after ${MAX_COLLISION_RETRIES} attempts. ` +
		`Current settings allow ~${combinationsStr} combinations (alphabet: ${nanoidAlphabet.length} chars, length: ${nanoidLength}). ` +
		`Consider increasing NanoID length or alphabet size.`,
		COLLISION_NOTICE_MS,
	);
}

/** Generates a unique ID with the configured algorithm, retrying past cached collisions. */
export function generateUID(ctx: UidContext): string {
	for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
		const id = generateRawUID(ctx);
		if (!ctx.uidCache.has(id)) {
			return id;
		}
		console.warn(`[UIDGenerator] Collision detected, retrying (${attempt + 1}/${MAX_COLLISION_RETRIES})`);
	}

	// All retries exhausted — notify the user and return the duplicate as last resort
	const fallback = generateRawUID(ctx);
	console.error(`[UIDGenerator] Failed to generate unique ID after ${MAX_COLLISION_RETRIES} attempts.`);
	warnCollisionExhausted(ctx);
	return fallback;
}

export interface MachineNodeIdStatus {
	/** The Node ID now stored in settings. */
	value: number;
	/** True when it came from this machine's MAC address rather than the random fallback. */
	fromMacAddress: boolean;
	/** True when settings changed and the caller should persist them. */
	changed: boolean;
}

/** Brings the cached machine Node ID in line with the current hardware. */
export function refreshMachineNodeId(ctx: UidContext): MachineNodeIdStatus {
	const detected = detectNodeId();
	const next = resolveAutoDetectedNodeId(ctx.settings.snowflakeNodeId, () => detected);
	if (next !== null) {
		ctx.settings.snowflakeNodeId = next;
	}
	return {
		value: ctx.settings.snowflakeNodeId,
		fromMacAddress: detected !== null,
		changed: next !== null,
	};
}
