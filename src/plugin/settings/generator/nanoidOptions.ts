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

/** What the user typed, or undefined when it is not a number — a half-typed field must not be saved. */
function parseInteger(value: string): number | undefined {
	const num = parseInt(value);
	return isNaN(num) ? undefined : num;
}

function renderLength({ containerEl, ctx }: SettingsSection): void {
	new Setting(containerEl)
		.setName('NanoID length')
		.setDesc(`Length of the generated ID (excluding separators). Min ${NANOID_MIN_LENGTH}, max ${NANOID_MAX_LENGTH}.`)
		.addText(text => text
			.setValue(String(ctx.settings.nanoidLength))
			.onChange(async (value) => {
				const length = parseInteger(value);
				if (length === undefined || length < NANOID_MIN_LENGTH || length > NANOID_MAX_LENGTH) return;
				ctx.settings.nanoidLength = length;
				await ctx.saveSettings();
			}));
}

function renderAlphabet({ containerEl, ctx }: SettingsSection): void {
	new Setting(containerEl)
		.setName('NanoID alphabet')
		.setDesc('Characters used for ID generation. Must have at least 2 unique characters.')
		.addTextArea(text => text
			.setValue(ctx.settings.nanoidAlphabet)
			.onChange(async (value) => {
				// One repeated character generates the same id every time; two is the floor.
				if (new Set(value).size < 2) return;
				ctx.settings.nanoidAlphabet = value;
				await ctx.saveSettings();
			}));
}

function renderRemoveGroupButton({ containerEl, ctx, refresh }: SettingsSection, index: number): void {
	new Setting(containerEl)
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
}

function renderSeparatorChar({ containerEl, ctx }: SettingsSection, index: number): void {
	new Setting(containerEl)
		.setName('Inject character')
		.setDesc('Single character to inject (e.g., "-").')
		.addText(text => text
			.setValue(ctx.settings.nanoidSeparators[index].char)
			.onChange(async (value) => {
				ctx.settings.nanoidSeparators[index].char = value.slice(0, 1);
				await ctx.saveSettings();
			}));
}

function renderSeparatorPosition({ containerEl, ctx }: SettingsSection, index: number): void {
	new Setting(containerEl)
		.setName('Injection position')
		.setDesc('Index to inject the character. Negative numbers count from the end.')
		.addText(text => text
			.setValue(String(ctx.settings.nanoidSeparators[index].position))
			.onChange(async (value) => {
				const position = parseInteger(value);
				if (position === undefined) return;
				ctx.settings.nanoidSeparators[index].position = position;
				await ctx.saveSettings();
			}));
}

/** One separator group's controls, drawn together in their own container. */
function renderSeparatorGroup(section: SettingsSection, index: number): void {
	const group: SettingsSection = {
		...section,
		containerEl: section.containerEl.createEl('div', { cls: 'uid-separator-group-container' }),
	};

	renderRemoveGroupButton(group, index);
	renderSeparatorChar(group, index);
	renderSeparatorPosition(group, index);
}

function renderSeparators(section: SettingsSection): void {
	const { containerEl, ctx, refresh } = section;

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

/** The NanoID controls, drawn only when NanoID is the selected algorithm. */
export function renderNanoidOptions(section: SettingsSection): void {
	renderLength(section);
	renderAlphabet(section);
	renderSeparators(section);
}
