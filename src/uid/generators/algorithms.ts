import { v4 as uuidv4 } from 'uuid';
import { ulid } from 'ulid';
import type { UIDGeneratorSettings } from '../settings';
import { generateNanoID } from './nanoid';
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

/** Runs the configured algorithm once. Collision checking is the caller's job. */
export function generateRawUID(settings: UIDGeneratorSettings): string {
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
