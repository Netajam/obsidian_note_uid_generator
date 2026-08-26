import { Setting } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../settings';
import { buildUidIndex } from '../../../uid/storage/vaultSync';
import type { SettingsSection } from '../section';
import { renderNanoidOptions } from './nanoidOptions';
import { renderSnowflakeOptions } from './snowflakeOptions';

/**
 * The head of this folder: how uids are named, and which algorithm makes them.
 *
 * Every algorithm's own settings live beside this file, one module each, and
 * are drawn only when that algorithm is the one selected. Adding an algorithm
 * is a change inside this folder; above it, the settings tab only asks for
 * "the generator section".
 */

/** No spaces, and an emptied field means the default rather than an unnamed key. */
function normalizeUidKey(value: string): string {
	return value.trim().replace(/\s+/g, '') || DEFAULT_SETTINGS.uidKey;
}

function renderUidKey({ containerEl, ctx, refresh }: SettingsSection): void {
	new Setting(containerEl)
		.setName('UID metadata key')
		.setDesc('The name of the key for the uid in frontmatter (e.g., "uid", "id"). No spaces.')
		.addText(text => text
			.setPlaceholder('Default: uid')
			.setValue(ctx.settings.uidKey)
			.onChange(async (value) => {
				const newKey = normalizeUidKey(value);
				const keyChanged = newKey !== ctx.settings.uidKey;
				ctx.settings.uidKey = newKey;
				if (value !== newKey) {
					text.setValue(newKey);
				}
				await ctx.saveSettings();
				if (keyChanged) {
					// The index is keyed by the old property; it no longer describes the vault.
					buildUidIndex(ctx);
				}
				refresh();
			}));
}

function renderAlgorithm({ containerEl, ctx, refresh }: SettingsSection): void {
	new Setting(containerEl).setName('UID generator type').setHeading();

	new Setting(containerEl)
		.setName('Generator algorithm')
		.setDesc('Choose between UUID (standard v4), NanoID (customizable), ULID (sortable, 26 chars), or Snowflake (64-bit, time-sortable, distributed).')
		.addDropdown(dropdown => dropdown
			.addOption('uuid', 'UUID')
			.addOption('nanoid', 'NanoID')
			.addOption('ulid', 'ULID')
			.addOption('snowflake', 'Snowflake')
			.setValue(ctx.settings.uidGenerator)
			.onChange(async (value: 'uuid' | 'nanoid' | 'ulid' | 'snowflake') => {
				ctx.settings.uidGenerator = value;
				await ctx.saveSettings();
				refresh();
			}));
}

/** How uids are named and generated. */
export function renderGeneratorSection(section: SettingsSection): void {
	renderUidKey(section);
	renderAlgorithm(section);

	if (section.ctx.settings.uidGenerator === 'nanoid') renderNanoidOptions(section);
	if (section.ctx.settings.uidGenerator === 'snowflake') renderSnowflakeOptions(section);
}
