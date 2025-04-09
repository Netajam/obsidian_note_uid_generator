# UID Generator Plugin for Obsidian

## Overview

The UID Generator plugin for Obsidian provides tools to create and manage unique identifiers (UIDs) for your notes directly within their frontmatter metadata. It allows for manual and automatic UID generation, customization of the metadata key and copy formats, and bulk operations within folders. This helps in creating stable, unique references for your notes, useful for linking, scripting, or external systems.

## Features

*   **Generate/Update UID:** Manually generate a new UID for the current note, optionally overwriting any existing UID under the configured key.
*   **Create UID If Missing:** Manually generate a UID for the current note *only* if one doesn't already exist.
*   **Remove UID:** Manually remove the UID from the current note's frontmatter.
*   **Copy UID:** Copy the UID of the current note to the clipboard.
*   **Copy title + UID:** Copy the title and UID of the current note (or multiple selected notes) to the clipboard, using a customizable format.
*   **Automatic UID Generation:** Automatically add a UID to notes upon creation or opening if they lack one.
    *   Configurable scope (entire vault or specific folder).
    *   Ability to exclude specific folders.
    *   Never overwrites existing UIDs during automatic generation.
*   **Clear UIDs in Folder:** Remove all UIDs (using the configured key) from notes within a specified folder and its subfolders, with confirmation.
*   **Customizable UID Key:** Choose the frontmatter key name for your UIDs (e.g., `uid`, `id`, `noteId`).
*   **Customizable Copy Format:** Define templates for how title/UID information is copied.
*   **Ribbon Icon:** Quick access to "Create UID if missing" for the current note.
*   **Context Menu Actions:**
    *   Right-click a folder: Copy titles+UIDs for all notes inside.
    *   Right-click a single note: Copy Title+UID.
    *   Right-click multiple selected notes: Copy titles+UIDs for the selection (uses undocumented `files-menu` event).
*   **Folder Path Suggestions:** Autocomplete suggestions for folder paths in settings.

## Installation

1.  Download the plugin files (`main.js`, `manifest.json`, `styles.css`) from the latest release on the GitHub repository (or build them yourself).
2.  Create a new folder named `obsidian-note-uid-generator` inside your Obsidian vault's plugins folder (`YourVault/.obsidian/plugins/`).
3.  Copy the downloaded `main.js`, `manifest.json`, and `styles.css` files into the `obsidian-note-uid-generator` folder.
4.  Restart Obsidian or reload plugins.
5.  Go to Obsidian Settings -> Community plugins.
6.  Find "UID Generator" in the list of installed plugins and enable it.

## Usage

### Commands

The plugin provides the following commands accessible from the command palette (Ctrl+P or Cmd+P):

*   **`UID Generator: Generate/Update [YourKeyName] (Overwrites)`:** Creates a new UID for the current note. If a UID already exists under the configured key name (`[YourKeyName]`), it will be **replaced**.
*   **`UID Generator: Create [YourKeyName] if missing`:** Creates a new UID for the current note **only if** one doesn't already exist under the configured key name.
*   **`UID Generator: Remove [YourKeyName] from current note`:** Deletes the UID key and value from the current note's frontmatter.
*   **`UID Generator: Copy [YourKeyName] of current note`:** Copies the UID value to the clipboard. (Only available if the current note has a UID).
*   **`UID Generator: Copy title + [YourKeyName]`:** Copies the current note's title and UID using the configured format. (Always available if a note is open).
*   **`UID Generator: Copy titles+[YourKeyName]s for selected files`:** Copies the titles and UIDs for all *Markdown* files currently selected in the file explorer, using the configured format. (Only available when the file explorer is active and has Markdown files selected).

### Ribbon Icon

*   A ribbon icon (looks like a scan/search symbol) is added to the left sidebar.
*   Clicking this icon performs the **`Create [YourKeyName] if missing`** action on the currently active note.

### Context Menus

*   **Right-clicking a Folder** in the file explorer: Provides an option `Copy titles+[YourKeyName]s from "[FolderName]"`. This copies the titles and UIDs of all Markdown notes within that folder (and subfolders) according to your format settings.
*   **Right-clicking a Single Markdown File:** Provides an option `Copy Title+[YourKeyName]`. This copies the title and UID for that specific file.
*   **Right-clicking multiple selected files:** Provides an option `Copy titles+[YourKeyName]s for X selected`. This copies the titles and UIDs for all selected Markdown files.
    *   **Note:** This specific multi-file context menu relies on an *undocumented* Obsidian event (`files-menu`). While functional, it could potentially break in future Obsidian updates. The Command Palette option provides a more stable alternative for multi-file selection.

### Settings

Access the plugin settings from Obsidian Settings -> Community Plugins -> UID Generator:

*   **General:**
    *   **UID Metadata Key:** Set the frontmatter key name used for storing UIDs (default: `uid`). Avoid spaces.
*   **Automatic UID Generation:**
    *   **Enable Automatic UID Generation:** Toggle the automatic creation of UIDs on/off.
    *   **Generation Scope:** Choose `Entire Vault` or `Specific Folder`.
    *   **Target Folder for Auto-Generation:** (Visible if Scope is 'Specific Folder') Enter the path to the folder where auto-generation should occur. Uses folder path suggestions.
    *   **Excluded Folders:** Click "Manage Exclusions" to open a modal where you can search, add, or remove folders that should be ignored by automatic generation. The current list is displayed below the button.
*   **Copy Format:**
    *   **Format (UID exists):** Define the template for copied text when a UID is present. Use placeholders `{title}`, `{uid}`, `{uidKey}`. (Default: `{title} - {uidKey}: {uid}`)
    *   **Format (UID missing):** Define the template for copied text when a UID is missing. Use placeholders `{title}`, `{uidKey}`. (Default: `{title} - No {uidKey}`)
*   **Manual UID Clearing:**
    *   **Folder to clear UIDs from:** Specify the vault path for the bulk removal action. Uses folder path suggestions.
    *   **Clear UIDs Now:** Button to initiate the removal process for the specified folder.
        *   **Warning:** This is irreversible.
        *   A confirmation modal will appear.
        *   If automatic UID generation is enabled, it will be temporarily disabled as a safety measure when you confirm the deletion. You will be notified and can re-enable it afterwards.

## Example Usage

*   **Ensure a Note Has a Unique ID:** Open the note, open the command palette, run `UID Generator: Create uid if missing`.
*   **Link Using UID:** Open a note, run `UID Generator: Copy uid`, paste the UID into another note's link or alias.
*   **Auto-Assign IDs to New Notes in Inbox:** Enable Automatic Generation, set Scope to 'Specific Folder', set Target Folder to `Inbox`.
*   **Clean Up Old IDs:** Set 'Folder to clear UIDs from' to `Archives/Old Project`, click 'Clear UIDs Now', confirm.
*   **Get List of Project Notes with IDs:** Right-click the `Projects/Current Project` folder, select `Copy titles+uids from "Current Project"`.

## Development

For developers interested in contributing:

### Setup

1.  Clone the GitHub repository to your local machine.
2.  Navigate to the repository directory.
3.  Install dependencies: `npm install` (or `yarn install`).

### Build

*   To compile the TypeScript code to JavaScript (`main.js`), run: `npm run build` (or `yarn build`).
*   For development, you can often use a watch command like `npm run dev` (if configured in `package.json`) to automatically rebuild on changes.

### Code Structure

*   `src/main.ts`: Main plugin class (`UIDGenerator`), `onload`, `onunload`, registration logic.
*   `src/settings.ts`: Settings interface (`UIDGeneratorSettings`), defaults (`DEFAULT_SETTINGS`), and the settings tab UI class (`UIDSettingTab`).
*   `src/commands.ts`: Contains handler functions for commands, context menu actions, and event listeners.
*   `src/uidUtils.ts`: Core utility functions for generating, getting, setting, removing, and formatting UIDs.
*   `src/ui/`: Contains UI component classes:
    *   `FolderSuggest.ts`
    *   `ConfirmationModal.ts`
    *   `FolderExclusionModal.ts`
*   `src/obsidian.d.ts`: Contains TypeScript declarations for undocumented Obsidian APIs used (like `files-menu`).

## Contributing

Contributions, issues, and feature requests are welcome! Please feel free to check the [issues page]([link-to-your-issues-page](https://github.com/Netajam/obsidian_note_uid_generator/issues)) or submit a pull request on the [GitHub repository]([link-to-your-repo](https://github.com/Netajam/obsidian_note_uid_generator)).

## License

This plugin is licensed under the MIT License. See the LICENSE file for details.