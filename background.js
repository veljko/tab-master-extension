import { createStartupGuard } from './src/startup-guard.js';
import { createMruManager } from './src/mru-manager.js';
import { createTabPositioner } from './src/tab-positioner.js';
import { createTabRearranger } from './src/tab-rearranger.js';

// Keep event registration in the service-worker entry point. Each controller
// owns one concern and does not restore, recreate, activate, or reload tabs.
const startupGuard = createStartupGuard();
const mru = createMruManager();
const positioner = createTabPositioner({
  startupGuard,
  getRecentOtherTabId: (windowId, excludedTabId) => mru.getRecentOtherTabId(windowId, excludedTabId)
});
const rearranger = createTabRearranger();

chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'quick-switch': void mru.quickSwitch(); break;
    case 'normal-switch-forward': void mru.normalSwitch(1); break;
    case 'normal-switch-backward': void mru.normalSwitch(-1); break;
    case 'move-tab-left': void rearranger.move(-1); break;
    case 'move-tab-right': void rearranger.move(1); break;
    case 'move-tab-first': void rearranger.moveToEdge('first'); break;
    case 'move-tab-last': void rearranger.moveToEdge('last'); break;
  }
});
