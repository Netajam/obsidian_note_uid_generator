import { Setting } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../settings';
import type { SettingsSection } from './section';

type FormatField = 'copyFormatString' | 'copyFormatStringMissingUid';

function renderFormatField({ containerEl, ctx }: SettingsSection, field: FormatField, name: string, desc: string): void {
	new Setting(containerEl)
		.setName(name)
		.setDesc(desc)
		.addText(text => text
			.setPlaceholder(DEFAULT_SETTINGS[field])
			.setValue(ctx.settings[field])
			.onChange(async (value) => {
				// An empty field means "use the default", not "copy nothing".
				ctx.settings[field] = value || DEFAULT_SETTINGS[field];
				await ctx.saveSettings();
			}));
}

/** The templates used by every copy action. */
export function renderCopyFormatSection(section: SettingsSection): void {
	new Setting(section.containerEl).setName('Copy format').setHeading();
	section.containerEl
		.createEl('p', { text: 'Define the format for copied text using placeholders: {title}, {uid}, {uidKey}.' })
		.addClass('setting-item-description');

	renderFormatField(section, 'copyFormatString',
		'Format (uid exists)',
		'Format string used when copying title and uid, and the uid exists.');
	renderFormatField(section, 'copyFormatStringMissingUid',
		'Format (uid missing)',
		'Format string used when copying, but the note has no uid.');
}
