// Test-only stub for the `obsidian` package, which ships types but no runtime entry.
// Vitest aliases imports of `obsidian` to this file so test code can load modules
// that import from `obsidian` without pulling in the real Electron-bound API.
//
// Only the runtime behavior the production code under test relies on is implemented.
// Anything else (full vault traversal, real plugin lifecycle, etc.) is intentionally
// out of scope — tests build their own fakes against this surface.

export class TAbstractFile {
	path = '';
}

export class TFile extends TAbstractFile {
	extension = '';
	basename = '';
	parent: TFolder | null = null;
}

export class TFolder extends TAbstractFile {
	name = '';
	children: TAbstractFile[] = [];
}

export class MarkdownView {
	file: TFile | null = null;
}

export class WorkspaceLeaf {
	view: unknown = null;
}

export class Notice {
	constructor(_message: string, _timeout?: number) {}
	setMessage(_message: string): this {
		return this;
	}
	hide(): void {}
}

export function normalizePath(input: string): string {
	if (!input) return '';
	let p = input.replace(/\\/g, '/').replace(/\/+/g, '/').trim();
	while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
	return p;
}
