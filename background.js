// =============================================================================
// TAB MASTER - Merged background service worker
// Combines: CLUT (MRU switching) + Rearrange Tabs + Tab Position Options Fork
// =============================================================================

// -----------------------------------------------------------------------------
// SECTION 1: MRU Tab Tracking (from CLUT)
// Maintains a list of tab IDs in most-recently-used order.
// -----------------------------------------------------------------------------

let mruList = [];       // tab IDs in MRU order, index 0 = most recent
let normalSwitchIndex = null;  // current position when doing a normal switch
let quickSwitchTimer = null;
let quickSwitchIndex = 0;

const QUICK_SWITCH_INTERVAL_MS = 400; // ms window to detect rapid keypresses

// Persist MRU list to session storage so it survives service worker restarts.
// chrome.storage.session is in-memory and scoped to the browser session —
// it is never written to disk and is cleared automatically when the browser closes.
function saveMRUList() {
  chrome.storage.session.set({ mruList });
}

function moveToFront(tabId) {
  mruList = [tabId, ...mruList.filter(id => id !== tabId)];
  saveMRUList();
}

function removeFromMRU(tabId) {
  mruList = mruList.filter(id => id !== tabId);
  saveMRUList();
}

// On service worker start, restore MRU list from session storage first.
// This handles the case where the browser killed the idle service worker
// mid-session (e.g. while Edge was minimized) — without this the list would
// reset to empty and Alt+W history would be lost.
(async () => {
  const { mruList: saved } = await chrome.storage.session.get('mruList');
  if (saved && saved.length > 0) {
    mruList = saved;
  } else {
    // No saved state (fresh browser start or first install) — build from tabs.
    const tabs = await chrome.tabs.query({});
    mruList = tabs.map(t => t.id);
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active) moveToFront(active.id);
  }
})();

// When a tab is activated, push it to front of MRU list
chrome.tabs.onActivated.addListener(({ tabId }) => {
  moveToFront(tabId);
  normalSwitchIndex = null; // reset normal switch position on manual tab change
});

// When a tab is removed, remove from MRU list
chrome.tabs.onRemoved.addListener((tabId) => {
  removeFromMRU(tabId);
});

// On browser startup, session storage is empty (new session), so rebuild from tabs.
chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  mruList = tabs.map(t => t.id);
  // put the active tab first
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active) moveToFront(active.id);
});

// On install, same thing
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  mruList = tabs.map(t => t.id);
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active) moveToFront(active.id);
});

async function switchToMRUTab(index) {
  if (mruList.length < 2) return;
  const targetId = mruList[index];
  if (targetId == null) return;
  try {
    const tab = await chrome.tabs.get(targetId);
    await chrome.tabs.update(targetId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (e) {
    // tab may have been closed; clean up and try next
    removeFromMRU(targetId);
  }
}

// Quick switch: rapid presses cycle further back in MRU list
function handleQuickSwitch() {
  if (quickSwitchTimer) {
    clearTimeout(quickSwitchTimer);
    quickSwitchIndex++;
  } else {
    quickSwitchIndex = 1;
  }

  switchToMRUTab(quickSwitchIndex);

  quickSwitchTimer = setTimeout(() => {
    quickSwitchTimer = null;
    quickSwitchIndex = 0;
  }, QUICK_SWITCH_INTERVAL_MS);
}

// Normal switch forward: move step by step through MRU list
async function handleNormalSwitchForward() {
  if (mruList.length < 2) return;
  if (normalSwitchIndex === null) {
    normalSwitchIndex = 1;
  } else {
    normalSwitchIndex = (normalSwitchIndex + 1) % mruList.length;
  }
  await switchToMRUTab(normalSwitchIndex);
}

// Normal switch backward
async function handleNormalSwitchBackward() {
  if (mruList.length < 2) return;
  if (normalSwitchIndex === null) {
    normalSwitchIndex = mruList.length - 1;
  } else {
    normalSwitchIndex = (normalSwitchIndex - 1 + mruList.length) % mruList.length;
  }
  await switchToMRUTab(normalSwitchIndex);
}

// -----------------------------------------------------------------------------
// SECTION 2: Tab Rearranging (from Rearrange Tabs)
// Moves current tab left, right, to first, or to last position.
// Supports multiple highlighted tabs.
// -----------------------------------------------------------------------------

async function getHighlightedTabs() {
  // Get all highlighted (multi-selected) tabs in the current window
  const tabs = await chrome.tabs.query({ highlighted: true, currentWindow: true });
  return tabs.sort((a, b) => a.index - b.index);
}

async function getAllTabsInWindow() {
  return chrome.tabs.query({ currentWindow: true });
}

async function moveTabLeft() {
  const highlighted = await getHighlightedTabs();
  if (!highlighted.length) return;
  const firstIndex = highlighted[0].index;
  if (firstIndex === 0) return; // already at left edge
  for (const tab of highlighted) {
    await chrome.tabs.move(tab.id, { index: tab.index - 1 });
  }
}

async function moveTabRight() {
  const highlighted = await getHighlightedTabs();
  const all = await getAllTabsInWindow();
  if (!highlighted.length) return;
  const lastIndex = highlighted[highlighted.length - 1].index;
  if (lastIndex >= all.length - 1) return; // already at right edge
  // move in reverse order to avoid index shifting issues
  for (const tab of [...highlighted].reverse()) {
    await chrome.tabs.move(tab.id, { index: tab.index + 1 });
  }
}

async function moveTabFirst() {
  const highlighted = await getHighlightedTabs();
  if (!highlighted.length) return;
  for (let i = 0; i < highlighted.length; i++) {
    await chrome.tabs.move(highlighted[i].id, { index: i });
  }
}

async function moveTabLast() {
  const highlighted = await getHighlightedTabs();
  const all = await getAllTabsInWindow();
  if (!highlighted.length) return;
  const targetStart = all.length - highlighted.length;
  for (let i = highlighted.length - 1; i >= 0; i--) {
    await chrome.tabs.move(highlighted[i].id, { index: targetStart + i });
  }
}

// -----------------------------------------------------------------------------
// SECTION 3: New Tab Position (from Tab Position Options Fork)
// Controls where newly created tabs are placed.
// Options: "last" | "first" | "right-of-current" | "left-of-current" | "default"
// -----------------------------------------------------------------------------

let newTabPosition = 'last'; // default setting

// Wait for the saved setting before handling creation events.
const newTabPositionReady = new Promise((resolve) => {
  chrome.storage.sync.get({ newTabPosition: 'last' }, (result) => {
    newTabPosition = result.newTabPosition;
    resolve();
  });
});

// Listen for setting changes from options page
chrome.storage.onChanged.addListener((changes) => {
  if (changes.newTabPosition) {
    newTabPosition = changes.newTabPosition.newValue;
  }
});

// Protect startup tab identities, not a time window. Session storage preserves
// this protection across worker restarts, including delayed creation events.
const restoredTabIds = new Set();
const observedNewTabIds = new Set();
const removedTabIds = new Set();
let restoreStorageWrite = Promise.resolve();

function persistRestoredTabIds() {
  const snapshot = [...restoredTabIds];
  restoreStorageWrite = restoreStorageWrite.catch(() => {}).then(() =>
    chrome.storage.session.set({ restoredTabIds: snapshot })
  );
  return restoreStorageWrite;
}

function markRestoredTabs(tabs) {
  for (const tab of tabs) {
    if (tab.id != null && !observedNewTabIds.has(tab.id) && !removedTabIds.has(tab.id)) {
      restoredTabIds.add(tab.id);
    }
  }
  // Save even an empty snapshot to distinguish initialization from worker wakeup.
  return persistRestoredTabIds();
}

const restoreStateReady = chrome.storage.session.get('restoredTabIds').then(async (saved) => {
  if (Array.isArray(saved.restoredTabIds)) {
    for (const tabId of saved.restoredTabIds) restoredTabIds.add(tabId);
  } else {
    // Edge can deliver restored onCreated events before onStartup.
    await markRestoredTabs(await chrome.tabs.query({}));
  }
});

let startupSnapshotReady = restoreStateReady;
chrome.runtime.onStartup.addListener(() => {
  const tabsReady = chrome.tabs.query({});
  startupSnapshotReady = Promise.all([startupSnapshotReady, tabsReady])
    .then(([, tabs]) => markRestoredTabs(tabs));
  return startupSnapshotReady;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  removedTabIds.add(tabId);
  observedNewTabIds.delete(tabId);
  await restoreStateReady;
  if (restoredTabIds.delete(tabId)) await persistRestoredTabIds();
});

chrome.tabs.onCreated.addListener(async (newTab) => {
  await newTabPositionReady;
  await startupSnapshotReady;
  if (restoredTabIds.has(newTab.id)) return;
  observedNewTabIds.add(newTab.id);
  if (newTabPosition === 'default') return;

  // Never override Edge placement for pinned/grouped tabs.
  if (newTab.pinned || (typeof newTab.groupId === 'number' && newTab.groupId !== -1)) return;

  let targetIndex;
  const allTabs = await chrome.tabs.query({ windowId: newTab.windowId });

  switch (newTabPosition) {
    case 'last':
      targetIndex = allTabs.length - 1;
      break;
    case 'first':
      targetIndex = allTabs.filter(tab => tab.pinned).length;
      break;
    case 'right-of-current': {
      const [active] = await chrome.tabs.query({ active: true, windowId: newTab.windowId });
      targetIndex = active ? active.index + 1 : allTabs.length - 1;
      break;
    }
    case 'left-of-current': {
      const [active] = await chrome.tabs.query({ active: true, windowId: newTab.windowId });
      targetIndex = active ? Math.max(0, active.index) : 0;
      break;
    }
    default:
      return;
  }

  const currentTab = await chrome.tabs.get(newTab.id).catch(() => null);
  if (!currentTab || currentTab.pinned || (typeof currentTab.groupId === 'number' && currentTab.groupId !== -1)) return;
  await startupSnapshotReady;
  if (restoredTabIds.has(currentTab.id) || removedTabIds.has(currentTab.id)) return;

  if (currentTab.index !== targetIndex) {
    await chrome.tabs.move(currentTab.id, { index: targetIndex });
  }
});

// -----------------------------------------------------------------------------
// SECTION 4: Command Router
// -----------------------------------------------------------------------------

chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'quick-switch':          handleQuickSwitch();        break;
    case 'normal-switch-forward': handleNormalSwitchForward(); break;
    case 'normal-switch-backward':handleNormalSwitchBackward();break;
    case 'move-tab-left':         moveTabLeft();              break;
    case 'move-tab-right':        moveTabRight();             break;
    case 'move-tab-first':        moveTabFirst();             break;
    case 'move-tab-last':         moveTabLast();              break;
  }
});
