// src/typings/obsidian.d.ts
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
