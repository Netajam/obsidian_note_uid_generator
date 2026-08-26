import { Plugin, PluginSettingTab } from 'obsidian';
import type { UidContext } from '../../uid/context';
import { renderAutoGenerationSection } from './autoGeneration/autoGenerationSection';
import { renderClearingSection } from './clearing/clearingSection';
import { renderCopyFormatSection } from './copyFormatSection';
import { renderGeneratorSection } from './generator/generatorSection';
import type { SettingsSection } from './section';

/**
 * The plugin's settings tab. It owns the container and the re-render, and
 * hands both to each section; the sections own everything else.
 */
export class UIDSettingTab extends PluginSettingTab {
	constructor(host: Plugin, private ctx: UidContext) {
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
		renderCopyFormatSection(section);
		renderClearingSection(section);
	}
}
