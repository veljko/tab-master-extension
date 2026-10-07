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

// Load saved setting
chrome.storage.sync.get({ newTabPosition: 'last' }, (result) => {
  newTabPosition = result.newTabPosition;
});

// Listen for setting changes from options page
chrome.storage.onChanged.addListener((changes) => {
  if (changes.newTabPosition) {
    newTabPosition = changes.newTabPosition.newValue;
  }
});

// Protect restored tabs/groups during slow, multi-wave startup restores. Store
// timestamps in session storage so the protection survives worker restarts.
const RESTORE_IDLE_SETTLE_MS = 30000;
const RESTORE_MAX_WINDOW_MS = 300000;
let restoreStartedAt = 0;
let restoreLastActivityAt = 0;

const restoreStateReady = chrome.storage.session
  .get(['restoreStartedAt', 'restoreLastActivityAt'])
  .then(async (saved) => {
    if (restoreStartedAt !== 0) return;
    if (saved.restoreStartedAt > 0) {
      restoreStartedAt = saved.restoreStartedAt;
      restoreLastActivityAt = saved.restoreLastActivityAt || 0;
    } else {
      // Restored tabs can emit onCreated before runtime.onStartup in Edge.
      // Arm the guard on a fresh session before any creation handler proceeds.
      await beginSessionRestoreTracking();
    }
  });

async function beginSessionRestoreTracking() {
  restoreStartedAt = Date.now();
  restoreLastActivityAt = restoreStartedAt;
  await chrome.storage.session.set({ restoreStartedAt, restoreLastActivityAt });
}

function isSessionRestoreActive() {
  const now = Date.now();
  return restoreStartedAt > 0
    && now - restoreStartedAt < RESTORE_MAX_WINDOW_MS
    && now - restoreLastActivityAt < RESTORE_IDLE_SETTLE_MS;
}

async function recordRestoreActivity() {
  restoreLastActivityAt = Date.now();
  await chrome.storage.session.set({ restoreLastActivityAt });
}

chrome.runtime.onStartup.addListener(() => {
  beginSessionRestoreTracking();
});

chrome.tabs.onCreated.addListener(async (newTab) => {
  await restoreStateReady;
  if (newTabPosition === 'default') return;

  // Skip repositioning during session restore to preserve saved tab order,
  // pinned state positions, and tab group memberships.
  if (isSessionRestoreActive()) {
    await recordRestoreActivity();
    return;
  }

  // Never override Edge placement for pinned/grouped tabs.
  if (newTab.pinned || (typeof newTab.groupId === 'number' && newTab.groupId !== -1)) return;

  let targetIndex;
  const allTabs = await chrome.tabs.query({ windowId: newTab.windowId });

  switch (newTabPosition) {
    case 'last':
      targetIndex = allTabs.length - 1;
      break;
    case 'first':
      targetIndex = 0;
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
  if (isSessionRestoreActive()) return;

  if (currentTab.index !== targetIndex) {
    await chrome.tabs.move(currentTab.id, { index: targetIndex });
  }
  await chrome.tabs.update(currentTab.id, { active: true });
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
