// src/obsidian.d.ts
import 'obsidian';

declare module 'obsidian' {
    interface Workspace {
        on(
            name: 'files-menu',
            callback: (
                menu: Menu,
                files: TAbstractFile[], 
                source: string,
                leaf?: WorkspaceLeaf
            ) => any,
            ctx?: any
        ): EventRef;
    }
}