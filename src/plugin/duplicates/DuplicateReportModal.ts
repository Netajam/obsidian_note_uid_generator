import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type { UidStore } from '../../uid/context';
import { renewUids, type DuplicateUidGroup } from '../../uid/duplicates';

/**
 * The duplicate report, and the two ways out of a group it offers: keep this
 * note's uid and renew the rest, or renew just this one and leave the rest
 * alone.
 *
 * Both exist because a group is read from either end. With two notes the
 * question is usually "which of these is the copy" — renew that one. With
 * several, it is usually "which of these is the original" — keep that one, and
 * the rest sort themselves out. Neither can be guessed: the oldest is normally
 * the note a copy was taken from, and so the one anything outside the vault
 * already points at, but only the user knows whether that holds here.
 *
 * The report edits itself in place as notes are resolved rather than
 * re-rendering. That is deliberate, and the same choice `FolderPickerModal`
 * makes: a modal that repaints from inside its own click handlers closes a
 * loop through every render method, and none of them can then be read alone.
 * A note whose renewal failed simply stays on the list, which is also the
 * honest thing to show.
 */

const RESULT_NOTICE_MS = 8000;

/** One note as it stands on screen, so a resolved one can take itself off. */
interface ReportedNote {
	note: TFile;
	el: HTMLElement;
}

/** One group on screen, and the notes still sharing its uid. */
interface ReportedGroup {
	uid: string;
	el: HTMLElement;
	sharers: ReportedNote[];
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
		this.reported = this.groups.map(group => this.renderGroup(list, group));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** What the report is about, in one line. */
	private summarize(): string {
		const noteCount = this.groups.reduce((total, group) => total + group.notes.length, 0);
		return `${this.groups.length} ${this.uidKey}${this.groups.length === 1 ? ' is' : 's are'} `
			+ `shared by ${noteCount} notes. Exactly one note in each group keeps its ${this.uidKey}; `
			+ `the rest are given fresh ones.`;
	}

	/** One shared uid, and a row per note carrying it. */
	private renderGroup(parent: HTMLElement, group: DuplicateUidGroup): ReportedGroup {
		const groupEl = parent.createDiv('uid-duplicate-group');
		groupEl.createDiv({ text: group.uid, cls: 'uid-duplicate-uid' });

		const reported: ReportedGroup = { uid: group.uid, el: groupEl, sharers: [] };
		group.notes.forEach((note, position) => {
			const row = groupEl.createDiv('setting-item');
			const info = row.createDiv('setting-item-info');
			info.createDiv({ text: note.path, cls: 'setting-item-name' });
			info.createDiv({
				text: position === 0 ? 'Oldest of the group' : `Created after ${group.notes[0].basename}`,
				cls: 'setting-item-description',
			});

			const controls = row.createDiv('setting-item-control');
			controls.createEl('button', { text: 'Keep this one' })
				.onclick = () => this.keepOnly(reported, note);
			controls.createEl('button', { text: `New ${this.uidKey} for this one` })
				.onclick = () => this.renewOne(reported, note);

			reported.sharers.push({ note, el: row });
		});
		return reported;
	}

	/**
	 * Renews the given notes and takes each one that took off the report.
	 *
	 * A group with one sharer left is no longer a duplicate, so it goes too —
	 * which is what makes both buttons converge on the same end state.
	 */
	private async renew(reported: ReportedGroup, notes: TFile[]): Promise<number> {
		const renewed = await renewUids(this.ctx, notes);

		for (const note of renewed) {
			const index = reported.sharers.findIndex(sharer => sharer.note.path === note.path);
			if (index < 0) continue;
			reported.sharers[index].el.remove();
			reported.sharers.splice(index, 1);
		}

		if (reported.sharers.length <= 1) reported.el.remove();
		return renewed.length;
	}

	/** This note keeps the uid; everything else still sharing it gives it up. */
	private async keepOnly(reported: ReportedGroup, keep: TFile): Promise<void> {
		const others = reported.sharers
			.filter(sharer => sharer.note.path !== keep.path)
			.map(sharer => sharer.note);

		const renewed = await this.renew(reported, others);
		new Notice(
			`Kept the ${this.uidKey} of "${keep.basename}" and renewed ${renewed} other note(s).`,
			RESULT_NOTICE_MS,
		);
	}

	/** This note gives the uid up; everything else still sharing it is left alone. */
	private async renewOne(reported: ReportedGroup, note: TFile): Promise<void> {
		if (await this.renew(reported, [note]) === 0) return; // renewUid already said why
		new Notice(`"${note.basename}" was given a fresh ${this.uidKey}.`, RESULT_NOTICE_MS);
	}

	/** The usual answer, applied to every group still standing. */
	private async resolveAll(): Promise<void> {
		let renewed = 0;
		for (const reported of this.reported) {
			if (reported.sharers.length < 2) continue;
			renewed += await this.renew(reported, reported.sharers.slice(1).map(sharer => sharer.note));
		}
		new Notice(`Renewed the ${this.uidKey} of ${renewed} note(s).`, RESULT_NOTICE_MS);
	}
}
