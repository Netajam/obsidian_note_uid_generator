import { Setting } from 'obsidian';
import { refreshMachineNodeId } from '../../../uid/generators/generate';
import type { SettingsSection } from '../section';

/**
 * Everything the Snowflake algorithm exposes to the user: the Node ID detected
 * from this machine, and the optional override that replaces it.
 *
 * A leaf of this folder — only the generator section decides whether these are
 * drawn at all, and only when Snowflake is the selected algorithm.
 */

const MAX_NODE_ID = 1023;

function describeMachineNodeId(macAvailable: boolean, overrideActive: boolean): string {
	const source = macAvailable
		? 'Auto-detected from this machine\'s MAC address.'
		: 'No MAC address available (mobile or restricted environment); using a random persistent value.';
	const usage = overrideActive
		? ' A Custom Node ID is set below — the machine value is currently NOT used.'
		: ' This is the value used for generated UIDs.';
	return source + usage;
}

/** The Snowflake controls, drawn only when Snowflake is the selected algorithm. */
export function renderSnowflakeOptions({ containerEl, ctx, refresh }: SettingsSection): void {
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
