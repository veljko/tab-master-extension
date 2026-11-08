# Tab Master: MRU Switch, Rearrange & Position

A Chrome/Edge extension that combines three tab management features in one:

- **MRU tab switching** — jump to your most recently used tabs
- **Tab rearranging** — move tabs left/right/first with keyboard shortcuts
- **New tab position** — control where new tabs open (end, after current, etc.)

## Features

### MRU Tab Switching
Tracks tabs in most-recently-used order. Two switching modes:

- **Quick Switch** (`Alt+W` by default) — press once to jump to the previous tab; press rapidly to cycle further back through history
- **Normal Switch forward/backward** — unassigned by default; assign in your browser's extension shortcut settings

### Tab Rearranging
| Shortcut | Action |
|---|---|
| *(unassigned)* | Move tab one position left |
| *(unassigned)* | Move tab one position right |
| `Ctrl+Shift+U` | Move tab to first position |
| `Ctrl+Shift+D` | Move tab to last position |

Move-left and move-right have no default shortcuts. Assign them manually in your browser's extension shortcut settings if needed.

### New Tab Position
Configure in the extension's Options page where new tabs open:
- At the end of the tab bar
- After the current tab
- Other positions

## Installation

### From Chrome Web Store / Edge Add-ons
*(Link here once published)*

### Manual / Development
1. Clone or download this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** and select this folder

## Local Development Workflow

Requirements: Node.js 18 or newer and Chrome or Edge. No npm packages need to be installed.

1. Load the repository folder as an unpacked extension from `chrome://extensions` or `edge://extensions`. Keep Developer mode enabled.
2. Reproduce an issue in the browser and note the browser/version, steps, and expected versus actual behavior.
3. Add or update a focused regression test in `tests/` before changing behavior where practical.
4. Run `npm run validate` to syntax-check the extension scripts and run the automated checks.
5. Make the smallest fix, rerun validation, then reload the unpacked extension and manually verify the affected browser behavior. Extension APIs and keyboard shortcuts still require a browser smoke test.
6. Run `npm run package` to create a versioned ZIP in `dist/` when you need a store package. `dist/` is generated output and is ignored by Git.

Useful commands:

- `npm test` — run automated checks using Node's built-in test runner.
- `npm run check` — syntax-check the extension JavaScript.
- `npm run validate` — run both checks and tests.
- `npm run package` — package the extension using `build.ps1` (PowerShell).

Keep changes to one issue or behavior at a time so failures are easy to attribute. Before committing, review `git diff` and confirm the browser smoke test for the changed feature.

## Keyboard Shortcuts

Default shortcuts are assigned in the manifest. To change or assign unassigned shortcuts:

1. Go to `edge://extensions/shortcuts` in Edge or `chrome://extensions/shortcuts` in Chrome
2. Find **Tab Master** and assign keys as desired

Chromium-based browsers allow up to **4 default shortcuts**. The following commands are unassigned by default and can be assigned manually:
- MRU Normal Switch (forward)
- MRU Normal Switch (backward)
- Move tab one position left
- Move tab one position right

To enable Ctrl+Tab quick switching and map Ctrl+Shift+Up/Down to the first/last tab commands in Edge, use AutoHotkey:

```autohotkey
#Requires AutoHotkey v2.0
#SingleInstance Force

; Remap Ctrl+Tab -> Alt+W for Tab Master extension (MRU quick switch)
; Scoped to Edge only — doesn't affect other apps.

#HotIf WinActive("ahk_exe msedge.exe")
^Tab:: Send("!w")
^+Tab:: Send("!w")   ; Ctrl+Shift+Tab also triggers quick switch (keeps cycling)
^+Up::Send("^+u")
^+Down::Send("^+d")
#HotIf
```

## Options Page

Access via the extension's options or `chrome://extensions` → Details → Extension options.

Set your preferred new tab position here. With a non-default position selected, newly created tabs are moved without changing which tab is selected. Ctrl+T tabs stay selected; Ctrl+Click tabs stay in the background. **First** places an unpinned tab immediately after pinned tabs, including at the top of Edge's vertical tabs pane. Pinned and grouped tabs keep their browser-assigned placement. Choose **Browser default** to leave placement and selection behavior to the browser.

At fresh-session initialization and browser startup, the extension snapshots existing tab IDs to protect restored tab order. These identities are stored in session storage, survive service worker restarts, and remain protected until the tabs close rather than expiring on a timer. New tabs not in those snapshots are eligible for positioning immediately.

The browser does not expose a definitive restored-tab flag. Tabs created after the startup snapshots, or when Edge reopens while its profile is already running in the background, may still be repositioned. They are never automatically selected by the positioning feature, so it does not activate unloaded restored tabs and trigger their reload. Tabs included in the initial snapshot conservatively keep their existing position, even if opened manually during initialization.

See the [privacy policy](./PRIVACY.md) for details about the browser-managed storage used by the extension.

## Building for Store Submission

Run the included PowerShell script to package the extension:

```powershell
.\build.ps1
```

This creates `dist/tab-master-extension-v<version>.zip` (for example, `dist/tab-master-extension-v1.0.9.zip`) containing all required files, ready for upload to the Chrome Web Store or Edge Add-ons dashboard.

To update an existing Chrome Web Store listing:

1. Ensure the manifest version is higher than the currently published version.
2. Run `npm run validate` and `npm run package`.
3. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and select the existing extension.
4. On the **Package** tab, choose **Upload New Package** and upload the versioned ZIP.
5. Update the store listing and privacy practices if needed, then choose **Submit for Review**. Select automatic publishing after approval, or publish manually once approved.

Browser extensions are published to the Chrome Web Store, not Google Play.

## Credits

This extension integrates three MIT‑licensed open‑source projects into a single package.

- **[CLUT](https://github.com/harshayburadkar/clut-chrome-extension)** by harshayburadkar — MRU tab switching
- **Rearrange Tabs** by mohnish — tab ordering shortcuts
- **Tab Position Options Fork** by proshunsuke — new tab position control
