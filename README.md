# Tab Master 1.1.0 (refactor)

Refactored from the public Tab Master 1.0.9 source. The extension remains Manifest V3 and uses only browser extension APIs.

## Architecture

- `src/mru-manager.js` — MRU activation history, scoped per window; keyboard switching activates existing tabs without moving or reloading them.
- `src/tab-positioner.js` — positions genuinely new, unpinned, ungrouped tabs. Moves are serialized per window and calculated from fresh tab metadata.
- `src/startup-guard.js` — conservatively suppresses automatic positioning while startup/session-restore activity is settling. It never moves tabs or groups.
- `src/tab-rearranger.js` — keyboard commands for moving selected tabs.
- `background.js` — event registration and controller composition.

## Startup restoration caveat

Chromium does not expose a definitive session-restore-complete event or a reliable `restored` flag on `tabs.Tab`. The guard therefore protects the initial tab snapshot and suppresses positioning during a 5-second quiet period after restore-related tab/group events, with a 60-second maximum. A tab created during that brief protection window is deliberately left where the browser put it. This is safer than trying to infer that a restored tab is new and moving it. No finite heuristic can guarantee perfect classification if a browser restores a tab unusually late.

## Build an installable test archive

Requires Windows PowerShell and .NET's compression libraries. From the repository root, run:

```powershell
.\build.ps1
```

The script reads the version from `manifest.json` and creates `dist\tab-master-extension-v1.1.0.zip`. It includes the extension entry points, all runtime modules under `src\`, and icons; tests and development files are excluded. The manifest maps the 16, 48, and 128 pixel icons for browser extension UI. Move-to-first and move-to-last are available as commands but have no default shortcuts to avoid conflicts with browser-reserved keys; assign shortcuts in the browser's extension shortcut settings. The generated archive is ready to extract and load as an unpacked extension.

## Install for testing

1. Keep the existing store-installed Tab Master disabled while testing this unpacked build; do not load both copies simultaneously.
2. Extract the generated ZIP somewhere permanent.
3. Open `edge://extensions` (or `chrome://extensions`).
4. Enable Developer mode and choose **Load unpacked**.
5. Select the extracted extension folder.
6. Open the extension's Options page and choose the new-tab position.

The extension does not call `tabs.reload`, `tabs.create`, `tabs.remove`, or session-restore APIs. It does not call `tabGroups.move`.

## Validation

Requires Node.js 18+:

```powershell
npm run validate
```

Browser smoke tests are still required for Edge and Chrome because Node tests cannot emulate browser tab restoration or extension event ordering.
