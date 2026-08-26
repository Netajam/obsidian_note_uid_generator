const NODE_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n; // 4095
const MAX_NODE_ID = (1n << NODE_ID_BITS) - 1n;   // 1023
const NODE_ID_SHIFT = SEQUENCE_BITS;              // 12
const TIMESTAMP_SHIFT = NODE_ID_BITS + SEQUENCE_BITS; // 22

// Bounds the spin-wait when the per-ms sequence overflows. 4096 ids/ms is
// the absolute throughput; anything below that wraps within the same ms.
const SPIN_WAIT_MAX_MS = 5n;

let lastTimestamp = -1n;
let sequence = 0n;

/**
 * Advances the generator's clock/sequence pair for one id and returns the
 * timestamp to stamp into it.
 *
 * Clock moved backwards (NTP, suspend/resume): bump the stored timestamp
 * forward by one ms instead of spinning. IDs stay monotonic across the jump at
 * the cost of a small future-skew until wall time catches up.
 */
function nextTimestamp(): bigint {
	let timestamp = BigInt(Date.now());

	if (timestamp < lastTimestamp) {
		sequence = 0n;
		return lastTimestamp + 1n;
	}

	if (timestamp > lastTimestamp) {
		sequence = 0n;
		return timestamp;
	}

	sequence = (sequence + 1n) & MAX_SEQUENCE;
	if (sequence !== 0n) return timestamp;

	// Sequence exhausted for this ms — wait for the next ms, but bound the
	// spin so a stuck clock can't deadlock the plugin.
	const spinDeadline = timestamp + SPIN_WAIT_MAX_MS;
	while (timestamp <= lastTimestamp && timestamp < spinDeadline) {
		timestamp = BigInt(Date.now());
	}
	return timestamp <= lastTimestamp ? lastTimestamp + 1n : timestamp;
}

export function generateSnowflakeID(nodeId: number): string {
	const nodeIdBigInt = BigInt(nodeId) & MAX_NODE_ID;
	const timestamp = nextTimestamp();
	lastTimestamp = timestamp;

	const id = (timestamp << TIMESTAMP_SHIFT)
		| (nodeIdBigInt << NODE_ID_SHIFT)
		| sequence;

	return id.toString();
}

/** Test-only: reset Snowflake module state between cases. */
export function _resetSnowflakeState(): void {
	lastTimestamp = -1n;
	sequence = 0n;
}
