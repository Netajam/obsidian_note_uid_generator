const NODE_ID_COUNT = 1024;

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
					return Math.abs(hash) % NODE_ID_COUNT;
				}
			}
		}
	} catch {
		// os module not available (mobile)
	}
	return null;
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
		return Math.floor(Math.random() * (NODE_ID_COUNT - 1)) + 1;
	}
	return null;
}
