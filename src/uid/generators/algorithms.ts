import { v4 as uuidv4 } from 'uuid';
import { ulid } from 'ulid';
import { generateNanoID, type NanoidSeparator } from './nanoid';
import { generateSnowflakeID } from './snowflake';
import { detectNodeId, resolveAutoDetectedNodeId } from './nodeId';

/**
 * The head of this folder: which id algorithms exist, and how to run one.
 *
 * The dispatch used to sit in `generate.ts`, one level up, which meant the
 * caller named every algorithm module — and that uuid and ulid were nowhere
 * near their siblings. Adding an algorithm is now a change inside this folder;
 * above it, the only question asked is "an id for these settings, please".
 */

/**
 * What running an algorithm needs, spelled out here rather than borrowed from
 * the persisted settings contract.
 *
 * Six of the seventeen stored fields matter to an id; naming those six is what
 * keeps this folder out of `src/settings.ts` entirely. `UIDGeneratorSettings`
 * satisfies it structurally, so callers still pass `ctx.settings` and the
 * compiler still objects the day a field here drifts from the one on disk.
 */
export interface AlgorithmOptions {
	uidGenerator: 'uuid' | 'nanoid' | 'ulid' | 'snowflake';
	nanoidLength: number;
	nanoidAlphabet: string;
	nanoidSeparators: NanoidSeparator[];
	snowflakeNodeId: number;
	snowflakeNodeIdOverride: number | null;
}

/** Runs the configured algorithm once. Collision checking is the caller's job. */
export function generateRawUID(settings: AlgorithmOptions): string {
	const { uidGenerator } = settings;

	if (uidGenerator === 'snowflake') {
		const { snowflakeNodeIdOverride, snowflakeNodeId } = settings;
		return generateSnowflakeID(snowflakeNodeIdOverride ?? snowflakeNodeId);
	}
	if (uidGenerator === 'nanoid') {
		const { nanoidAlphabet, nanoidLength, nanoidSeparators } = settings;
		return generateNanoID(nanoidAlphabet, nanoidLength, nanoidSeparators);
	}
	if (uidGenerator === 'ulid') {
		return ulid();
	}
	return uuidv4();
}

export interface MachineNodeId {
	/** The node id to store, or null when the cached one still stands. */
	next: number | null;
	/** True when it came from this machine's MAC address rather than the random fallback. */
	fromMacAddress: boolean;
}

/** Reads this machine's Snowflake node id, given whichever one is cached. */
export function resolveMachineNodeId(cached: number): MachineNodeId {
	const detected = detectNodeId();
	return {
		next: resolveAutoDetectedNodeId(cached, () => detected),
		fromMacAddress: detected !== null,
	};
}
