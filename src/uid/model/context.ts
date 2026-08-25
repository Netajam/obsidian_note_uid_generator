import { App } from 'obsidian';
import type { UIDGeneratorSettings } from './settings';

/**
 * Everything the plugin's features need from the plugin instance.
 *
 * Features depend on this interface rather than on the concrete `UIDGenerator`
 * class, so the dependency runs from `main.ts` outward and never back. It also
 * makes every feature testable against a plain object.
 */
export interface UidContext {
	app: App;
	settings: UIDGeneratorSettings;
	/** Every uid currently present in the vault — used for collision detection. */
	uidCache: Set<string>;
	/** File path → uid, so deletions can evict from `uidCache` without metadata. */
	uidPathMap: Map<string, string>;
	saveSettings(): Promise<void>;
}
