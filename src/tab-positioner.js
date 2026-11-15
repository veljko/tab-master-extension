import { calculateTargetIndex } from './tab-positioning.js';

const SETTING_KEY = 'newTabPosition';
const DEFAULT_POSITION = 'last';
const SETTLE_DELAY_MS = 250;

export function createTabPositioner({ startupGuard, getRecentOtherTabId }) {
  let position = DEFAULT_POSITION;
  const queues = new Map();

  const settingsReady = new Promise((resolve) => {
    chrome.storage.sync.get({ [SETTING_KEY]: DEFAULT_POSITION }, (result) => {
      position = result[SETTING_KEY] ?? DEFAULT_POSITION;
      resolve();
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes[SETTING_KEY]) {
      position = changes[SETTING_KEY].newValue ?? DEFAULT_POSITION;
    }
  });

  function enqueue(windowId, task) {
    const previous = queues.get(windowId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    queues.set(windowId, next);
    void next.finally(() => {
      if (queues.get(windowId) === next) queues.delete(windowId);
    });
    return next;
  }

  chrome.tabs.onCreated.addListener((createdTab) => {
    void (async () => {
      await Promise.all([settingsReady, startupGuard.ready]);
      if (await startupGuard.shouldProtect(createdTab)) return;
      if (position === 'default') return;
      if (createdTab.pinned || (createdTab.groupId != null && createdTab.groupId !== -1)) return;

      await enqueue(createdTab.windowId, async () => {
        // Let Chrome/Edge finish assigning opener/group metadata before moving.
        await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
        const current = await chrome.tabs.get(createdTab.id).catch(() => null);
        if (!current || current.pinned || (current.groupId != null && current.groupId !== -1)) return;

        const tabs = await chrome.tabs.query({ windowId: current.windowId });
        const recentId = current.openerTabId ?? await getRecentOtherTabId(current.windowId, current.id);
        const targetIndex = calculateTargetIndex({
          position,
          tab: current,
          tabs,
          anchorTabId: recentId
        });
        if (targetIndex == null || targetIndex === current.index) return;

        // Moving a tab does not recreate it or change its active state.
        await chrome.tabs.move(current.id, { index: targetIndex }).catch(() => {});
      });
    })().catch((error) => console.warn('[Tab Master] New-tab positioning failed:', error));
  });
}
