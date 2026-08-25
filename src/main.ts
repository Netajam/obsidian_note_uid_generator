import { Plugin } from 'obsidian';
import { startUidGenerator } from './plugin/register';

/**
 * The Obsidian entry point, and nothing more. Everything this plugin does
 * lives under `src/plugin` (the Obsidian-facing surface) and `src/uid`
 * (the domain), so this file never has to name either one's vocabulary.
 */
export default class UIDGenerator extends Plugin {
	async onload() {
		await startUidGenerator(this);
	}
}
