import { Notice, Plugin, Setting } from 'obsidian';
import type { UidContext } from '../../uid/context';
import { findDuplicateUids } from '../../uid/duplicates';
import type { SettingsSection } from '../settings/section';
import { DuplicateReportModal } from './DuplicateReportModal';

/**
 * The head of this folder: everything about duplicate uids that faces the
 * user — the scan, the three ways to start it, and the settings that govern
 * the watch on notes as they arrive.
 *
 * It sits beside `commands/` and `settings/` rather than inside either,
 * because it is both: a ribbon icon and a command, and a settings section.
 * Putting it in one of those folders would have the other reach across into
 * it, which is the arrangement `npm run arch` exists to prevent. The
 * composition root wires it instead, and hands its section to the settings
 * tab — so the tab still owns the container, and this still owns its own
 * widgets.
 */

const RIBBON_ICON = 'search';

/** Reads every note, and opens the report only when there is something to report. */
function openDuplicateReport(ctx: UidContext): void {
	const { uidKey } = ctx.settings;
	const duplicates = findDuplicateUids(ctx);

	if (duplicates.length === 0) {
		new Notice(`No duplicate ${uidKey}s found.`);
		return;
	}
	new DuplicateReportModal(ctx.app, ctx, uidKey, duplicates).open();
}

/** What happens when a note turns up carrying a uid another note already has. */
function renderCheckPolicy({ containerEl, ctx }: SettingsSection): void {
	const { uidKey } = ctx.settings;

	new Setting(containerEl)
		.setName(`On a new note arriving with a duplicate ${uidKey}`)
		.setDesc(
			`A note copied, synced in, or made from a template brings its ${uidKey} with it, so two notes end up `
			+ `sharing one. Renewing rewrites the new note's ${uidKey}, never the note it came from.`,
		)
		.addDropdown(dropdown => dropdown
			.addOption('off', 'Do nothing')
			.addOption('notify', 'Show a notice')
			.addOption('regenerate', `Generate a fresh ${uidKey}`)
			.setValue(ctx.settings.duplicateUidCheck)
			.onChange(async (value) => {
				ctx.settings.duplicateUidCheck = value as typeof ctx.settings.duplicateUidCheck;
				await ctx.saveSettings();
			}));
}

/** The vault-wide scan, for the duplicates that were already there. */
function renderScanButton({ containerEl, ctx }: SettingsSection): void {
	const { uidKey } = ctx.settings;

	new Setting(containerEl)
		.setName(`Scan the vault for duplicate ${uidKey}s`)
		.setDesc(
			`Reads every note's ${uidKey} and lists the ones more than one note carries. `
			+ 'Also available from the ribbon and the command palette.',
		)
		.addButton(button => button
			.setButtonText('Scan now')
			.onClick(() => openDuplicateReport(ctx)));
}

/**
 * The standing watch covers notes as they arrive and can say nothing about the
 * duplicates a vault already had; the scan reads every note, so it is a button
 * rather than a background job. The two cover different ground on purpose.
 */
export function renderDuplicatesSection(section: SettingsSection): void {
	new Setting(section.containerEl).setName('Duplicate uids').setHeading();

	renderCheckPolicy(section);
	renderScanButton(section);
}

/** Wires the scan into the ribbon and the command palette. Called once, at startup. */
export function registerDuplicateScan(host: Plugin, ctx: UidContext): void {
	const name = `Scan for duplicate ${ctx.settings.uidKey}s`;

	host.addRibbonIcon(RIBBON_ICON, name, () => openDuplicateReport(ctx));
	host.addCommand({ id: 'scan-duplicate-uids', name, callback: () => openDuplicateReport(ctx) });
}
