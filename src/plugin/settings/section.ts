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

/**
 * How a section is drawn — the shape every `render*Section` already has.
 *
 * Named so that a feature living outside this folder can hand its section to
 * the tab without the tab having to reach across and fetch it.
 */
export type RenderSettingsSection = (section: SettingsSection) => void;
