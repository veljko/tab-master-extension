const STORAGE_KEY = 'tabMasterMruByWindow';
const QUICK_SWITCH_INTERVAL_MS = 400;

function uniqueValidIds(ids, validIds) {
  const seen = new Set();
  return (Array.isArray(ids) ? ids : []).filter((id) => {
    if (!validIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function createMruManager() {
  const byWindow = new Map();
  const quickCycles = new Map();
  const normalCycles = new Map();
  const expectedActivations = new Map();
  let writeQueue = Promise.resolve();

  const ready = (async () => {
    const saved = await chrome.storage.session.get(STORAGE_KEY);
    const stored = saved[STORAGE_KEY] ?? {};
    for (const [windowId, ids] of Object.entries(stored)) {
      byWindow.set(Number(windowId), Array.isArray(ids) ? ids : []);
    }

    const tabs = await chrome.tabs.query({});
    const grouped = new Map();
    for (const tab of tabs) {
      if (!grouped.has(tab.windowId)) grouped.set(tab.windowId, []);
      grouped.get(tab.windowId).push(tab);
    }

    for (const [windowId, windowTabs] of grouped) {
      const valid = new Set(windowTabs.map((tab) => tab.id));
      const existing = uniqueValidIds(byWindow.get(windowId), valid);
      if (existing.length) {
        const missing = windowTabs
          .sort((a, b) => a.index - b.index)
          .map((tab) => tab.id)
          .filter((id) => !existing.includes(id));
        byWindow.set(windowId, [...existing, ...missing]);
      } else {
        const ordered = [...windowTabs].sort((a, b) => a.index - b.index);
        const active = ordered.find((tab) => tab.active);
        byWindow.set(windowId, active
          ? [active.id, ...ordered.filter((tab) => tab.id !== active.id).map((tab) => tab.id)]
          : ordered.map((tab) => tab.id));
      }
    }
    await persist();
  })();

  function persist() {
    const snapshot = Object.fromEntries(byWindow.entries());
    writeQueue = writeQueue.catch(() => {}).then(() =>
      chrome.storage.session.set({ [STORAGE_KEY]: snapshot })
    );
    return writeQueue;
  }

  function listFor(windowId) {
    return byWindow.get(windowId) ?? [];
  }

  function touch(windowId, tabId) {
    const next = [tabId, ...listFor(windowId).filter((id) => id !== tabId)];
    byWindow.set(windowId, next);
    void persist();
  }

  function remove(windowId, tabId) {
    byWindow.set(windowId, listFor(windowId).filter((id) => id !== tabId));
    void persist();
  }

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    void ready.then(() => {
      touch(windowId, tabId);
      const expected = expectedActivations.get(windowId);
      if (expected?.has(tabId)) {
        expected.delete(tabId);
        if (expected.size === 0) expectedActivations.delete(windowId);
      } else {
        normalCycles.delete(windowId);
        quickCycles.delete(windowId);
      }
    });
  });

  chrome.tabs.onCreated.addListener((tab) => {
    void ready.then(() => {
      if (!listFor(tab.windowId).includes(tab.id)) {
        byWindow.set(tab.windowId, [...listFor(tab.windowId), tab.id]);
        void persist();
      }
    });
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    void ready.then(() => {
      remove(removeInfo.windowId, tabId);
      quickCycles.delete(removeInfo.windowId);
      normalCycles.delete(removeInfo.windowId);
    });
  });

  chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    void ready.then(() => remove(detachInfo.oldWindowId, tabId));
  });

  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    void ready.then(() => {
      if (!listFor(attachInfo.newWindowId).includes(tabId)) {
        byWindow.set(attachInfo.newWindowId, [...listFor(attachInfo.newWindowId), tabId]);
        void persist();
      }
    });
  });

  chrome.tabs.onReplaced?.addListener((addedTabId, removedTabId) => {
    void ready.then(() => {
      for (const [windowId, ids] of byWindow) {
        if (!ids.includes(removedTabId)) continue;
        byWindow.set(windowId, ids.map((id) => id === removedTabId ? addedTabId : id));
      }
      void persist();
    });
  });

  async function getFocusedWindowId() {
    const win = await chrome.windows.getLastFocused({ populate: false });
    return win?.id;
  }

  async function activate(windowId, tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!expectedActivations.has(windowId)) expectedActivations.set(windowId, new Set());
      expectedActivations.get(windowId).add(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
    } catch {
      remove(windowId, tabId);
    }
  }

  function cycleSnapshot(windowId, map) {
    let cycle = map.get(windowId);
    if (!cycle) {
      cycle = { ids: [...listFor(windowId)], index: null };
      map.set(windowId, cycle);
    }
    return cycle;
  }

  async function quickSwitch() {
    await ready;
    const windowId = await getFocusedWindowId();
    if (windowId == null) return;

    let cycle = quickCycles.get(windowId);
    if (!cycle) {
      cycle = { ids: [...listFor(windowId)], index: 1, timer: null };
      quickCycles.set(windowId, cycle);
    } else {
      cycle.index += 1;
      clearTimeout(cycle.timer);
    }

    const targetId = cycle.ids[cycle.index];
    if (targetId != null) await activate(windowId, targetId);

    cycle.timer = setTimeout(() => quickCycles.delete(windowId), QUICK_SWITCH_INTERVAL_MS);
  }

  async function normalSwitch(direction) {
    await ready;
    const windowId = await getFocusedWindowId();
    if (windowId == null) return;

    let cycle = cycleSnapshot(windowId, normalCycles);
    if (cycle.index == null) {
      cycle.index = direction > 0 ? 1 : cycle.ids.length - 1;
    } else {
      cycle.index = (cycle.index + direction + cycle.ids.length) % cycle.ids.length;
    }
    const targetId = cycle.ids[cycle.index];
    if (targetId != null) await activate(windowId, targetId);
  }

  async function getRecentOtherTabId(windowId, excludedTabId) {
    await ready;
    return listFor(windowId).find((id) => id !== excludedTabId) ?? null;
  }

  return { ready, quickSwitch, normalSwitch, getRecentOtherTabId };
}
