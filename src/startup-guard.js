const STORAGE_KEY = 'tabMasterStartupGuard';
const QUIET_PERIOD_MS = 5_000;
const MAX_PROTECTION_MS = 60_000;

/**
 * Chromium does not expose a definitive "session restore completed" event.
 * This guard therefore takes the conservative route: existing tabs are
 * protected, and tabs created during the initial restore burst are not moved.
 * Protection ends after a quiet period, or after the hard upper bound.
 */
export function createStartupGuard() {
  let state = null;
  const protectedTabIds = new Set();

  const ready = (async () => {
    const saved = await chrome.storage.session.get(STORAGE_KEY);
    const previous = saved[STORAGE_KEY];

    if (previous && typeof previous.startedAt === 'number') {
      state = previous;
      for (const id of previous.protectedTabIds ?? []) protectedTabIds.add(id);
    } else {
      const now = Date.now();
      state = { active: true, startedAt: now, lastActivityAt: now, protectedTabIds: [] };
    }

    // Snapshot tabs already visible to the browser. The quiet-period guard
    // covers tabs Edge/Chrome finish restoring after this query completes.
    const existingTabs = await chrome.tabs.query({});
    for (const tab of existingTabs) {
      if (Number.isInteger(tab.id)) protectedTabIds.add(tab.id);
    }
    await persist();
  })();

  async function persist() {
    if (!state) return;
    state.protectedTabIds = [...protectedTabIds];
    await chrome.storage.session.set({ [STORAGE_KEY]: state });
  }

  function noteRestoreActivity() {
    if (!state?.active) return;
    state.lastActivityAt = Date.now();
    void persist();
  }

  // Called by the tab-created handler BEFORE it does any positioning.
  async function shouldProtect(tab) {
    await ready;
    if (tab?.id != null && protectedTabIds.has(tab.id)) return true;
    if (!state?.active) return false;

    const now = Date.now();
    const withinMaximum = now - state.startedAt < MAX_PROTECTION_MS;
    const restoreStillActive = now - state.lastActivityAt < QUIET_PERIOD_MS;

    if (withinMaximum && restoreStillActive) {
      if (tab?.id != null) protectedTabIds.add(tab.id);
      state.lastActivityAt = now;
      await persist();
      return true;
    }

    // Once the restore stream has settled, permanently open the positioner
    // for this browser session. We never revisit or reorder protected tabs.
    state.active = false;
    await persist();
    return false;
  }

  chrome.tabs.onAttached.addListener(() => noteRestoreActivity());
  chrome.tabs.onDetached.addListener(() => noteRestoreActivity());
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (Object.hasOwn(changeInfo, 'groupId')) noteRestoreActivity();
  });
  chrome.tabGroups?.onCreated?.addListener(() => noteRestoreActivity());
  chrome.tabGroups?.onMoved?.addListener(() => noteRestoreActivity());

  return { ready, shouldProtect };
}
