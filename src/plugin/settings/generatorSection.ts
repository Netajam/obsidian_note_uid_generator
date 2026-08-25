import { Setting } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../uid/model/settings';
import { buildUidCache } from '../../uid/storage/cache';
import { refreshMachineNodeId } from '../../uid/generate';
import { SettingsSection } from './section';

const NANOID_MIN_LENGTH = 4;
const NANOID_MAX_LENGTH = 128;
const MAX_NODE_ID = 1023;
const DEFAULT_SEPARATOR = { char: '-', position: -2 };

function renderUidKey({ containerEl, ctx, refresh }: SettingsSection): void {
	new Setting(containerEl)
		.setName('UID metadata key')
		.setDesc('The name of the key for the uid in frontmatter (e.g., "uid", "id"). No spaces.')
		.addText(text => text
			.setPlaceholder('Default: uid')
			.setValue(ctx.settings.uidKey)
			.onChange(async (value) => {
				const newKey = value.trim().replace(/\s+/g, '') || DEFAULT_SETTINGS.uidKey;
				const keyChanged = newKey !== ctx.settings.uidKey;
				ctx.settings.uidKey = newKey;
				if (value !== newKey) {
					text.setValue(newKey);
				}
				await ctx.saveSettings();
				if (keyChanged) {
					// The cache is keyed by the old property; it no longer describes the vault.
					buildUidCache(ctx);
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

function renderNanoidOptions(section: SettingsSection): void {
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

function describeMachineNodeId(macAvailable: boolean, overrideActive: boolean): string {
	const source = macAvailable
		? 'Auto-detected from this machine\'s MAC address.'
		: 'No MAC address available (mobile or restricted environment); using a random persistent value.';
	const usage = overrideActive
		? ' A Custom Node ID is set below — the machine value is currently NOT used.'
		: ' This is the value used for generated UIDs.';
	return source + usage;
}

function renderSnowflakeOptions({ containerEl, ctx, refresh }: SettingsSection): void {
	new Setting(containerEl).setName('Snowflake settings').setHeading();

	// Refresh the cached machine value before rendering, so the field below shows
	// the real detected value (not the lingering 0 from before the user picked
	// Snowflake). Fire-and-forget: display() is sync, the in-memory mutation takes
	// effect immediately and the next save flushes it to disk.
	const machineNodeId = refreshMachineNodeId(ctx);
	if (machineNodeId.changed) {
		ctx.saveSettings();
	}

	const override = ctx.settings.snowflakeNodeIdOverride;
	const overrideActive = override !== null;

	new Setting(containerEl)
		.setName('Machine Node ID')
		.setDesc(describeMachineNodeId(machineNodeId.fromMacAddress, overrideActive))
		.addText(text => {
			text.setValue(String(machineNodeId.value));
			text.setDisabled(true);
		});

	new Setting(containerEl)
		.setName('Custom Node ID')
		.setDesc(overrideActive
			? `Override active — generated UIDs use ${override} instead of the Machine Node ID above. Clear this field to fall back to the machine value.`
			: `Optional. If set, overrides the Machine Node ID for generated UIDs. Leave empty to use the machine value. Range: 0–${MAX_NODE_ID}.`)
		.addText(text => {
			text.setPlaceholder('(none)');
			text.setValue(override === null ? '' : String(override));
			text.onChange(async (value) => {
				const next = parseNodeIdOverride(value);
				if (next === undefined || next === ctx.settings.snowflakeNodeIdOverride) return;
				ctx.settings.snowflakeNodeIdOverride = next;
				await ctx.saveSettings();
				refresh();
			});
		});
}

/** null clears the override, a number sets it, undefined means "not a valid entry — ignore". */
function parseNodeIdOverride(value: string): number | null | undefined {
	const trimmed = value.trim();
	if (trimmed === '') return null;
	const num = parseInt(trimmed, 10);
	return !isNaN(num) && num >= 0 && num <= MAX_NODE_ID ? num : undefined;
}

/** How uids are named and generated. */
export function renderGeneratorSection(section: SettingsSection): void {
	renderUidKey(section);
	renderAlgorithm(section);

	if (section.ctx.settings.uidGenerator === 'nanoid') renderNanoidOptions(section);
	if (section.ctx.settings.uidGenerator === 'snowflake') renderSnowflakeOptions(section);
}
