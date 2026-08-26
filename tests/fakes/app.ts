import { vi } from 'vitest';
import { TFile, TFolder, MarkdownView } from 'obsidian';
import type { UidContext } from '../../src/uid/context';
import { UidIndex } from '../../src/uid/storage/uidIndex';
import { DEFAULT_SETTINGS, UIDGeneratorSettings } from '../../src/settings';

export interface FileSpec {
	path: string;
	extension?: string;
	frontmatter?: Record<string, unknown>;
	/** Creation time, which is what duplicate groups are ordered by. */
	ctime?: number;
}

function buildTFile(spec: FileSpec, parent: TFolder | null): TFile {
	const file = new TFile();
	file.path = spec.path;
	file.extension = spec.extension ?? 'md';
	const slash = spec.path.lastIndexOf('/');
	const name = slash >= 0 ? spec.path.slice(slash + 1) : spec.path;
	const ext = '.' + file.extension;
	file.basename = file.extension && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
	file.parent = parent;
	file.stat = { ctime: spec.ctime ?? 0, mtime: 0, size: 0 };
	return file;
}

function buildFolderTree(files: TFile[]): Map<string, TFolder> {
	const folders = new Map<string, TFolder>();
	const root = new TFolder();
	root.path = '/';
	root.name = '';
	folders.set('/', root);

	for (const file of files) {
		const parts = file.path.split('/');
		parts.pop();
		let parentPath = '/';
		let parent = root;
		for (const part of parts) {
			const path = parentPath === '/' ? part : `${parentPath}/${part}`;
			let folder = folders.get(path);
			if (!folder) {
				folder = new TFolder();
				folder.path = path;
				folder.name = part;
				folders.set(path, folder);
				parent.children.push(folder);
			}
			parent = folder;
			parentPath = path;
		}
		file.parent = parent;
		parent.children.push(file);
	}
	return folders;
}

export interface FakeApp {
	plugin: UidContext;
	settings: UIDGeneratorSettings;
	files: TFile[];
	folders: Map<string, TFolder>;
	uidIndex: UidIndex;
	frontmatterByPath: Map<string, Record<string, unknown>>;
	processFrontMatter: ReturnType<typeof vi.fn>;
	clipboardWrites: string[];
	activeFile: TFile | null;
	setActiveFile(file: TFile | null): void;
}

export function makeFakeApp(opts: {
	files: FileSpec[];
	settings?: Partial<UIDGeneratorSettings>;
	/** Path → uid, pre-loaded into the index for tests about what it already knew. */
	indexed?: Record<string, string>;
}): FakeApp {
	const settings: UIDGeneratorSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
	const uidIndex = new UidIndex();
	for (const [path, uid] of Object.entries(opts.indexed ?? {})) uidIndex.set(path, uid);

	const fmByPath = new Map<string, Record<string, unknown>>();
	for (const spec of opts.files) {
		fmByPath.set(spec.path, { ...(spec.frontmatter ?? {}) });
	}

	const tFiles = opts.files.map((spec) => buildTFile(spec, null));
	const folders = buildFolderTree(tFiles);

	let activeFile: TFile | null = null;
	const activeView: MarkdownView = new MarkdownView();

	const processFrontMatter = vi.fn(
		async (file: TFile, fn: (frontmatter: Record<string, unknown>) => void) => {
			let fm = fmByPath.get(file.path);
			if (!fm) {
				fm = {};
				fmByPath.set(file.path, fm);
			}
			fn(fm);
		},
	);

	const clipboardWrites: string[] = [];

	const plugin = {
		settings,
		uidIndex,
		app: {
			workspace: {
				getActiveViewOfType: (_view: unknown) => (activeFile ? activeView : null),
				activeLeaf: null,
				getLeavesOfType: (_type: string) => [],
			},
			vault: {
				getMarkdownFiles: () => tFiles.filter((f) => f.extension === 'md'),
				getAbstractFileByPath: (path: string) => {
					if (folders.has(path)) return folders.get(path) ?? null;
					return tFiles.find((f) => f.path === path) ?? null;
				},
			},
			metadataCache: {
				getFileCache: (file: TFile) => ({ frontmatter: fmByPath.get(file.path) }),
			},
			fileManager: {
				processFrontMatter,
			},
		},
	} as unknown as UidContext;

	return {
		plugin,
		settings,
		files: tFiles,
		folders,
		uidIndex,
		frontmatterByPath: fmByPath,
		processFrontMatter,
		clipboardWrites,
		get activeFile() {
			return activeFile;
		},
		setActiveFile(file: TFile | null) {
			activeFile = file;
			activeView.file = file;
		},
	};
}

export function installFakeClipboard(): { writes: string[]; restore: () => void } {
	const writes: string[] = [];
	const fakeNavigator = {
		clipboard: {
			writeText: vi.fn(async (text: string) => {
				writes.push(text);
			}),
		},
	};
	// vi.stubGlobal uses Object.defineProperty so it works even when the
	// runtime exposes `navigator` as a read-only getter.
	vi.stubGlobal('navigator', fakeNavigator);
	return {
		writes,
		restore: () => {
			vi.unstubAllGlobals();
		},
	};
}
