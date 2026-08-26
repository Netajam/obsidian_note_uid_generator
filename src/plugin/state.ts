import { Plugin } from 'obsidian';
import { refreshMachineNodeId } from '../uid/generators/generate';
import type { UidContext } from '../uid/context';
import { migrateSettings, type UIDGeneratorSettings } from '../settings';

/**
 * The adapter that satisfies the uid domain's `UidContext` port using
 * Obsidian's plugin persistence.
 *
 * The domain says what state it needs; this says where it lives. The entry
 * point only has to hand over an Obsidian `Plugin`, and never has to name
 * what the uid domain keeps in it.
 */
class UidState implements UidContext {
	readonly uidCache = new Set<string>();
	readonly uidPathMap = new Map<string, string>();

	constructor(private host: Plugin, public settings: UIDGeneratorSettings) {}

	get app() {
		return this.host.app;
	}

	async saveSettings(): Promise<void> {
		await this.host.saveData(this.settings);
	}
}

/** Loads persisted settings, migrating them forward, and returns the live uid state. */
export async function loadUidState(host: Plugin): Promise<UidContext> {
	const { settings, needsSave } = migrateSettings(await host.loadData());
	const state = new UidState(host, settings);

	// Refresh the cached machine Node ID for Snowflake on load. The override
	// (if any) still takes precedence at generation time, but we want the
	// machine value to reflect the current hardware.
	const nodeIdChanged = settings.uidGenerator === 'snowflake' && refreshMachineNodeId(state).changed;

	if (needsSave || nodeIdChanged) {
		await state.saveSettings();
	}
	return state;
}
