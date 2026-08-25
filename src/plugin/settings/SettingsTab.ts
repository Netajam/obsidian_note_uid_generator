import { Plugin, PluginSettingTab } from 'obsidian';
import type { UidContext } from '../../uid/model/context';
import { renderAutoGenerationSection } from './autoGenerationSection';
import { renderClearingSection } from './clearingSection';
import { renderCopyFormatSection } from './copyFormatSection';
import { renderGeneratorSection } from './generatorSection';
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
