import { Setting } from 'obsidian';
import type { SettingsSection } from '../section';

/**
 * Everything the NanoID algorithm exposes to the user: its length, its
 * alphabet, and the separator groups injected into a raw id.
 *
 * A leaf of this folder — only the generator section decides whether these are
 * drawn at all, and only when NanoID is the selected algorithm.
 */

const NANOID_MIN_LENGTH = 4;
const NANOID_MAX_LENGTH = 128;
const DEFAULT_SEPARATOR = { char: '-', position: -2 };

function renderSeparatorGroup(section: SettingsSection, index: number): void {
	const { containerEl, ctx, refresh } = section;
	const separator = ctx.settings.nanoidSeparators[index];
	const groupContainer = containerEl.createEl('div', { cls: 'uid-separator-group-container' });

	new Setting(groupContainer)
		.setName(`Separator Group ${index + 1}`)
		.setHeading()
		.addButton(button => button
			.setButtonText('Remove')
			.setWarning()
			.setTooltip('Remove this separator group')
			.onClick(async () => {
				ctx.settings.nanoidSeparators.splice(index, 1);
				await ctx.saveSettings();
				refresh();
			}));

	new Setting(groupContainer)
		.setName('Inject character')
		.setDesc('Single character to inject (e.g., "-").')
		.addText(text => text
			.setValue(separator.char)
			.onChange(async (value) => {
				ctx.settings.nanoidSeparators[index].char = value.slice(0, 1);
				await ctx.saveSettings();
			}));

	new Setting(groupContainer)
		.setName('Injection position')
		.setDesc('Index to inject the character. Negative numbers count from the end.')
		.addText(text => text
			.setValue(String(separator.position))
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num)) {
					ctx.settings.nanoidSeparators[index].position = num;
					await ctx.saveSettings();
				}
			}));
}

/** The NanoID controls, drawn only when NanoID is the selected algorithm. */
export function renderNanoidOptions(section: SettingsSection): void {
	const { containerEl, ctx, refresh } = section;

	new Setting(containerEl)
		.setName('NanoID length')
		.setDesc(`Length of the generated ID (excluding separators). Min ${NANOID_MIN_LENGTH}, max ${NANOID_MAX_LENGTH}.`)
		.addText(text => text
			.setValue(String(ctx.settings.nanoidLength))
			.onChange(async (value) => {
				const num = parseInt(value);
				if (!isNaN(num) && num >= NANOID_MIN_LENGTH && num <= NANOID_MAX_LENGTH) {
					ctx.settings.nanoidLength = num;
					await ctx.saveSettings();
				}
			}));

	new Setting(containerEl)
		.setName('NanoID alphabet')
		.setDesc('Characters used for ID generation. Must have at least 2 unique characters.')
		.addTextArea(text => text
			.setValue(ctx.settings.nanoidAlphabet)
			.onChange(async (value) => {
				if (new Set(value).size >= 2) {
					ctx.settings.nanoidAlphabet = value;
					await ctx.saveSettings();
				}
			}));

	containerEl.createEl('h3', { text: 'NanoID Separator Groups' });
	containerEl.createEl('p', { text: 'Define characters to inject into the NanoID at specific positions. Position is calculated from the raw Base ID.' })
		.addClass('setting-item-description');

	ctx.settings.nanoidSeparators.forEach((_separator, index) => renderSeparatorGroup(section, index));

	new Setting(containerEl)
		.setName('Add new separator group')
		.setDesc('Adds a new group for injecting a character at a specific position.')
		.addButton(button => button
			.setButtonText('Add Group')
			.setCta()
			.onClick(async () => {
				ctx.settings.nanoidSeparators.push({ ...DEFAULT_SEPARATOR });
				await ctx.saveSettings();
				refresh();
			}));
}
