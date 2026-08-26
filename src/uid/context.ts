import { App } from 'obsidian';
import type { UIDGeneratorSettings } from '../settings';
import type { UidIndex } from './storage/uidIndex';

/**
 * What the uid domain reads and writes: the vault, the settings values, and
 * the index of which note carries which uid.
 *
 * It stops deliberately short of `saveSettings`. The domain does change
 * settings in place — a migration, a refreshed Snowflake node id — but *when*
 * that reaches disk is the plugin surface's call, made once after a batch of
 * edits rather than on each one. Splitting the port here turns that from a
 * convention into something the compiler enforces.
 */
export interface UidStore {
	app: App;
	settings: UIDGeneratorSettings;
	/** Which notes carry which uid — read by collision detection and duplicate detection alike. */
	uidIndex: UidIndex;
}

/**
 * The store, plus the ability to persist it: everything the plugin's features
 * need from the plugin instance.
 *
 * Features depend on this interface rather than on the concrete `UIDGenerator`
 * class, so the dependency runs from `main.ts` outward and never back. It also
 * makes every feature testable against a plain object.
 */
export interface UidContext extends UidStore {
	saveSettings(): Promise<void>;
}
