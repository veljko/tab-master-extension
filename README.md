# Tab Master: MRU Switch, Rearrange & Position

A Chrome/Edge extension that combines three tab management features in one:

- **MRU tab switching** — jump to your most recently used tabs
- **Tab rearranging** — move tabs left/right/first with keyboard shortcuts
- **New tab position** — control where new tabs open (end, after current, etc.)

## Features

### MRU Tab Switching
Tracks tabs in most-recently-used order. Two switching modes:

- **Quick Switch** (`Alt+W` by default) — press once to jump to the previous tab; press rapidly to cycle further back through history
- **Normal Switch forward/backward** — unassigned by default; assign in `chrome://extensions/shortcuts`

### Tab Rearranging
| Shortcut | Action |
|---|---|
| `Shift+Alt+←` | Move tab one position left |
| `Shift+Alt+→` | Move tab one position right |
| `Shift+Alt+↑` | Move tab to first position |
| *(unassigned)* | Move tab to last position |

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

1. Go to `chrome://extensions/shortcuts`
2. Find **Tab Master** and assign keys as desired

Chrome limits extensions to **4 default shortcuts**. The following are unassigned by default and must be set manually:
- MRU Normal Switch (forward)
- MRU Normal Switch (backward)
- Move tab to last position

To enable Ctrl+Tab functionality, it’s best to use AutoHotkey.

```
#Requires AutoHotkey v2.0
#SingleInstance Force

; Remap Ctrl+Tab -> Alt+W for Tab Master extension (MRU quick switch)
; Scoped to Edge and Chrome only — doesn't affect other apps.

#HotIf WinActive("ahk_exe msedge.exe")
^Tab:: Send("!w")
^+Tab:: Send("!w")   ; Ctrl+Shift+Tab also triggers quick switch (keeps cycling)
#HotIf

#HotIf WinActive("ahk_exe chrome.exe")
^Tab:: Send("!w")
^+Tab:: Send("!w")
#HotIf
```

## Options Page

Access via the extension's options or `chrome://extensions` → Details → Extension options.

Set your preferred new tab position here. With a non-default position selected, newly created tabs are moved to that position and selected, including tabs opened with Ctrl+Click. Choose **Browser default** to leave placement and selection behavior to the browser.

During browser startup, automatic positioning and selection are paused to preserve restored tab and group order, including in Edge's vertical tabs pane. This protection starts before the browser's startup event, survives service worker restarts, and ends after 30 seconds without tab creation (or at most 5 minutes). Tabs opened manually during that interval also keep their browser-assigned position and selection.

See the [privacy policy](./PRIVACY.md) for details about the browser-managed storage used by the extension.

## Building for Store Submission

Run the included PowerShell script to package the extension:

```powershell
.\build.ps1
```

This creates `dist/tab-master-extension.zip` containing all required files, ready for upload to the Chrome Web Store or Edge Add-ons dashboard.

## Credits

This extension integrates three MIT‑licensed open‑source projects into a single package.

- **[CLUT](https://github.com/harshayburadkar/clut-chrome-extension)** by harshayburadkar — MRU tab switching
- **Rearrange Tabs** by mohnish — tab ordering shortcuts
- **Tab Position Options Fork** by proshunsuke — new tab position control
