import { Notice, Setting } from 'obsidian';
import { findDuplicateUids } from '../../../uid/duplicates';
import { DuplicateReportModal } from './DuplicateReportModal';
import type { SettingsSection } from '../section';

/**
 * Duplicate uids: the standing watch on notes as they arrive, and the
 * vault-wide scan for the ones already there.
 *
 * The two cover different ground on purpose. The watch only ever looks at a
 * note the moment it is created, which is cheap and catches the copy that
 * causes the problem; it can say nothing about the duplicates a vault already
 * had when the watch was switched on. The scan reads every note, so it is a
 * button rather than a background job.
 */

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

/** The vault-wide scan. Opens the report only when there is something to report. */
function renderScanButton({ containerEl, ctx }: SettingsSection): void {
	const { uidKey } = ctx.settings;

	new Setting(containerEl)
		.setName(`Scan the vault for duplicate ${uidKey}s`)
		.setDesc(`Reads every note's ${uidKey} and lists the ones more than one note carries.`)
		.addButton(button => button
			.setButtonText('Scan now')
			.onClick(() => {
				const duplicates = findDuplicateUids(ctx);
				if (duplicates.length === 0) {
					new Notice(`No duplicate ${uidKey}s found.`);
					return;
				}
				new DuplicateReportModal(ctx.app, ctx, uidKey, duplicates).open();
			}));
}

/** Finding and resolving notes that share a uid. */
export function renderDuplicatesSection(section: SettingsSection): void {
	new Setting(section.containerEl).setName('Duplicate uids').setHeading();

	renderCheckPolicy(section);
	renderScanButton(section);
}
