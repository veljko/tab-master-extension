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

> **PowerToys tip:** Map Ctrl+Tab → Alt+W in PowerToys Keyboard Manager (scoped to `msedge.exe` or `chrome.exe`) to get browser-native-feeling MRU switching.

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

## Keyboard Shortcuts

Default shortcuts are assigned in the manifest. To change or assign unassigned shortcuts:

1. Go to `chrome://extensions/shortcuts`
2. Find **Tab Master** and assign keys as desired

Chrome limits extensions to **4 default shortcuts**. The following are unassigned by default and must be set manually:
- MRU Normal Switch (forward)
- MRU Normal Switch (backward)
- Move tab to last position

## Options Page

Access via the extension's options or `chrome://extensions` → Details → Extension options.

Set your preferred new tab position here.

## Building for Store Submission

Run the included PowerShell script to package the extension:

```powershell
.\build.ps1
```

This creates `dist/tab-master-extension.zip` containing all required files, ready for upload to the Chrome Web Store or Edge Add-ons dashboard.

## Credits

This extension merges functionality from three open-source extensions:

- **[CLUT](https://github.com/harshayburadkar/clut-chrome-extension)** by harshayburadkar — MRU tab switching
- **Rearrange Tabs** by mohnish — tab ordering shortcuts
- **Tab Position Options Fork** by proshunsuke — new tab position control
