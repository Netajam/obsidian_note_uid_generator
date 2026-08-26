import { App } from 'obsidian';
import type { UIDGeneratorSettings } from './settings';

/**
 * What the uid domain reads and writes: the vault, the settings values, and
 * the collision caches.
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
	/** Every uid currently present in the vault — used for collision detection. */
	uidCache: Set<string>;
	/** File path → uid, so deletions can evict from `uidCache` without metadata. */
	uidPathMap: Map<string, string>;
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
