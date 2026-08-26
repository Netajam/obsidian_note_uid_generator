import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type { UidStore } from '../../../uid/context';
import { resolveDuplicateUids, type DuplicateUidGroup } from '../../../uid/duplicates';

/**
 * The duplicate report, and the one repair it offers: keep one note's uid and
 * renew everybody else's.
 *
 * Which note to keep is the user's call and cannot be guessed. The oldest is
 * usually the one a copy was taken from, and so the one anything outside the
 * vault already points at — but only the user knows whether that is true here.
 * So the notes are listed oldest first and every one of them is offered as the
 * keeper, with "keep the oldest" as the shortcut for the usual answer.
 *
 * A resolved group leaves the report by having its own element removed, rather
 * than by the report re-rendering itself. That is deliberate, and the same
 * choice `FolderPickerModal` makes: a modal that repaints from inside its own
 * click handlers closes a loop through every render method, and none of them
 * can then be read on its own. A group whose repair fell short simply stays,
 * which is also the honest thing to show.
 */

const RESULT_NOTICE_MS = 8000;

/** One group as it stands on screen, so a resolved one can take itself off. */
interface ReportedGroup {
	group: DuplicateUidGroup;
	el: HTMLElement;
}

export class DuplicateReportModal extends Modal {
	private reported: ReportedGroup[] = [];

	constructor(
		app: App,
		private ctx: UidStore,
		private uidKey: string,
		private groups: DuplicateUidGroup[],
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('uid-duplicate-report');

		contentEl.createEl('h2', { text: `Duplicate ${this.uidKey}s` });
		contentEl.createEl('p', { text: this.summarize() });

		new Setting(contentEl)
			.setName('Resolve every duplicate')
			.setDesc(`Keeps the oldest note in each group and renews the ${this.uidKey} of the others.`)
			.addButton(button => button
				.setButtonText('Keep the oldest in each')
				.setCta()
				.onClick(() => this.resolveAll()));

		const list = contentEl.createDiv('uid-duplicate-groups');
		this.reported = this.groups.map(group => ({ group, el: this.renderGroup(list, group) }));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** What the report is about, in one line. */
	private summarize(): string {
		const noteCount = this.groups.reduce((total, group) => total + group.notes.length, 0);
		return `${this.groups.length} ${this.uidKey}${this.groups.length === 1 ? ' is' : 's are'} `
			+ `shared by ${noteCount} notes. Keeping one note's ${this.uidKey} generates a fresh one for the rest.`;
	}

	/** One shared uid, and a row per note carrying it. */
	private renderGroup(parent: HTMLElement, group: DuplicateUidGroup): HTMLElement {
		const groupEl = parent.createDiv('uid-duplicate-group');
		groupEl.createDiv({ text: group.uid, cls: 'uid-duplicate-uid' });

		group.notes.forEach((note, position) => {
			const row = groupEl.createDiv('setting-item');
			const info = row.createDiv('setting-item-info');
			info.createDiv({ text: note.path, cls: 'setting-item-name' });
			info.createDiv({
				text: position === 0 ? 'Oldest of the group' : `Created after ${group.notes[0].basename}`,
				cls: 'setting-item-description',
			});

			const button = row.createDiv('setting-item-control').createEl('button', { text: 'Keep this one' });
			button.onclick = () => this.resolve({ group, el: groupEl }, note);
		});
		return groupEl;
	}

	/**
	 * Renews every note in one group but `keep`, and takes the group off the
	 * report once nothing is left sharing.
	 *
	 * @returns How many notes were renewed. A shortfall means a write failed —
	 * `renewUid` has already said so — and the group stays on screen.
	 */
	private async renew(reported: ReportedGroup, keep: TFile): Promise<number> {
		const renewed = await resolveDuplicateUids(this.ctx, reported.group, keep);
		if (renewed === reported.group.notes.length - 1) reported.el.remove();
		return renewed;
	}

	/** One group, resolved the way the user picked. */
	private async resolve(reported: ReportedGroup, keep: TFile): Promise<void> {
		const renewed = await this.renew(reported, keep);
		new Notice(
			`Kept the ${this.uidKey} of "${keep.basename}" and renewed ${renewed} other note(s).`,
			RESULT_NOTICE_MS,
		);
	}

	/** The usual answer, applied to every group still standing. */
	private async resolveAll(): Promise<void> {
		let renewed = 0;
		for (const reported of this.reported) {
			renewed += await this.renew(reported, reported.group.notes[0]);
		}
		new Notice(`Renewed the ${this.uidKey} of ${renewed} note(s).`, RESULT_NOTICE_MS);
	}
}
