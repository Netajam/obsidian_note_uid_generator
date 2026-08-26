import { Plugin, PluginSettingTab } from 'obsidian';
import type { UidContext } from '../../uid/context';
import { renderAutoGenerationSection } from './autoGeneration/autoGenerationSection';
import { renderClearingSection } from './clearing/clearingSection';
import { renderCopyFormatSection } from './copyFormatSection';
import { renderGeneratorSection } from './generator/generatorSection';
import type { RenderSettingsSection, SettingsSection } from './section';

/**
 * The plugin's settings tab. It owns the container and the re-render, and
 * hands both to each section; the sections own everything else.
 *
 * The sections in this folder it names directly. `featureSections` is for the
 * ones it cannot: a feature that is also a command or a ribbon icon lives
 * outside this folder, and importing its section from here would have two
 * folders reaching into each other. The composition root hands those over
 * instead, and this decides where in the tab they are drawn.
 */
export class UIDSettingTab extends PluginSettingTab {
	constructor(
		host: Plugin,
		private ctx: UidContext,
		private featureSections: RenderSettingsSection[] = [],
	) {
		super(host.app, host);
	}

	display(): void {
		this.containerEl.empty();

		const section: SettingsSection = {
			containerEl: this.containerEl,
			ctx: this.ctx,
			refresh: () => this.display(),
		};

		renderGeneratorSection(section);
		renderAutoGenerationSection(section);
		for (const render of this.featureSections) render(section);
		renderCopyFormatSection(section);
		// Last, and deliberately: it is the only destructive one.
		renderClearingSection(section);
	}
}
