import type { UidContext } from '../../uid/context';

/**
 * What each section of the settings tab is handed: where to draw, what to
 * read and write, and how to ask for a full re-render when a change reveals
 * or hides other settings.
 */
export interface SettingsSection {
	containerEl: HTMLElement;
	ctx: UidContext;
	refresh(): void;
}
