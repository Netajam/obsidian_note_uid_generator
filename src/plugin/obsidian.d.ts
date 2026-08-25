// src/typings/obsidian.d.ts
// Mirrors Obsidian's own d.ts conventions for undocumented APIs (callbacks return `any`,
// opaque ctx is `any`). Keep `any` here so the patches stay shape-compatible upstream.
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'obsidian';

declare module 'obsidian' {
    interface Workspace {
        on(
            name: 'files-menu',
            callback: (
                menu: Menu,
                files: TAbstractFile[], // Note: it's an array
                source: string,
                leaf?: WorkspaceLeaf
            ) => any,
            ctx?: any
        ): EventRef;
    }


    interface FileExplorerView extends View {
        selectedFiles?: string[];
    }

 

}
