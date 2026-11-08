const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest declares a valid unpacked extension entry point and icons', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(manifest.version);

  const referencedFiles = [
    manifest.background.service_worker,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
  ];

  for (const file of referencedFiles) {
    assert.ok(fs.existsSync(path.join(root, file)), `Missing manifest file: ${file}`);
  }
});

test('new-tab position options match the background worker settings', () => {
  const optionsHtml = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
  const backgroundJs = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const optionValues = [...optionsHtml.matchAll(/name="newTabPosition"[\s\S]*?value="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual([...new Set(optionValues)].sort(), [
    'default',
    'first',
    'last',
    'left-of-current',
    'right-of-current',
  ]);

  for (const value of optionValues) {
    const isHandled = value === 'default'
      ? backgroundJs.includes("newTabPosition === 'default'")
      : backgroundJs.includes(`case '${value}'`);
    assert.ok(isHandled, `Background worker does not handle: ${value}`);
  }
});

test('all declared commands have a background-worker handler', () => {
  const backgroundJs = fs.readFileSync(path.join(root, 'background.js'), 'utf8');

  for (const command of Object.keys(manifest.commands)) {
    assert.ok(backgroundJs.includes(`case '${command}'`), `No handler for command: ${command}`);
  }
});

function createBackgroundHarness({
  sessionState, position = 'first', now = 60000, initialTabs, queryHook, getHook, syncHook,
} = {}) {
  const listeners = {};
  const handlers = {};
  const tabs = initialTabs ?? [
    { id: 1, index: 0, windowId: 1, active: true },
    { id: 2, index: 1, windowId: 1, active: false },
    { id: 3, index: 2, windowId: 1, active: false },
  ];
  const state = sessionState ?? { restoredTabIds: [] };
  let currentTime = now;
  const moves = [];
  const updates = [];
  const focuses = [];
  const event = (name) => ({ addListener: (listener) => {
    (handlers[name] ??= []).push(listener);
    listeners[name] = (...args) => Promise.all(handlers[name].map((handler) => handler(...args)));
  } });
  const chrome = {
    storage: {
      session: {
        get: async () => structuredClone(state),
        set: async (values) => { Object.assign(state, structuredClone(values)); },
      },
      sync: { get: (_defaults, callback) => {
        if (syncHook) syncHook(callback);
        else callback({ newTabPosition: position });
      } },
      onChanged: event('storageChanged'),
    },
    tabs: {
      onActivated: event('activated'),
      onRemoved: event('removed'),
      onCreated: event('created'),
      query: async (query) => {
        const snapshot = tabs.filter((tab) =>
          (query.windowId === undefined || tab.windowId === query.windowId)
          && (!query.active || tab.active)
          && (!query.currentWindow || tab.windowId === 1)
          && (!query.highlighted || tab.highlighted || tab.active),
        ).map((tab) => ({ ...tab }));
        if (queryHook) await queryHook(query);
        return snapshot;
      },
      move: async (id, { index }) => {
        moves.push(id);
        const tab = tabs.find((item) => item.id === id);
        const windowTabs = tabs.filter((item) => item.windowId === tab.windowId && item.id !== id);
        windowTabs.splice(index, 0, tab);
        windowTabs.forEach((item, tabIndex) => { item.index = tabIndex; });
        tabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index);
      },
      update: async (id, properties) => {
        updates.push(id);
        const selected = tabs.find((tab) => tab.id === id);
        if (properties.active) {
          tabs.filter((tab) => tab.windowId === selected.windowId).forEach((tab) => {
            tab.active = tab.id === id;
            if (tab.active) tab.discarded = false;
          });
        }
      },
      get: async (id) => {
        if (getHook) await getHook(id, tabs);
        const tab = tabs.find((item) => item.id === id);
        if (!tab) throw new Error('Tab closed');
        return { ...tab };
      },
    },
    windows: { update: async (id) => { focuses.push(id); } },
    runtime: { onStartup: event('startup'), onInstalled: event('installed') },
    commands: { onCommand: event('command') },
  };

  vm.runInNewContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), {
    chrome, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return currentTime; } },
  });
  return { listeners, tabs, moves, updates, focuses, state, setTime: (time) => { currentTime = time; } };
}

test('all positions preserve selection and never activate background tabs', async () => {
  for (const [position, expectedIndex] of [
    ['first', 0], ['last', 2], ['right-of-current', 1], ['left-of-current', 0], ['default', 2],
  ]) {
    const { listeners, tabs, updates } = createBackgroundHarness({ position });
    const tab = tabs[2];
    await listeners.created(tab);
    assert.equal(tab.index, expectedIndex, position);
    assert.equal(tab.active, false, position);
    assert.equal(tabs.find((item) => item.id === 1).active, true, position);
    assert.deepEqual(updates, [], position);
  }
});

test('foreground new tabs stay selected when moved first', async () => {
  const { listeners, tabs, updates } = createBackgroundHarness();
  tabs[0].active = false;
  tabs[2].active = true;
  await listeners.created(tabs[2]);
  assert.equal(tabs[0].id, 3);
  assert.equal(tabs[0].active, true);
  assert.deepEqual(updates, []);
});

test('cold-start creation before onStartup preserves all snapshot tabs and groups', async () => {
  for (const position of ['first', 'last', 'right-of-current', 'left-of-current']) {
    const { listeners, tabs, moves, updates } = createBackgroundHarness({ sessionState: {}, position });
    tabs[0].pinned = true;
    tabs[1].groupId = 7;
    await Promise.all(tabs.map((tab) => listeners.created({ ...tab, groupId: -1 })));
    await listeners.startup();
    assert.deepEqual(moves, [], position);
    assert.deepEqual(updates, [], position);
    assert.deepEqual(tabs.map((tab) => tab.id), [1, 2, 3], position);
    assert.equal(tabs[0].pinned, true);
    assert.equal(tabs[1].groupId, 7);
  }
});

test('restored identities never expire and persist across worker restarts', async () => {
  const { listeners, tabs, moves, state, setTime } = createBackgroundHarness({ sessionState: {} });
  await listeners.created(tabs[2]);
  for (const time of [91001, 360001, 86400000]) {
    setTime(time);
    await listeners.created(tabs[2]);
  }
  assert.deepEqual(moves, []);
  assert.deepEqual(state.restoredTabIds, [1, 2, 3]);
  const restarted = createBackgroundHarness({ sessionState: state, now: 86400000 });
  await restarted.listeners.created(restarted.tabs[2]);
  assert.deepEqual(restarted.moves, []);
  assert.deepEqual(restarted.updates, []);
});

test('new tabs are eligible immediately after a startup snapshot', async () => {
  const { listeners, tabs, moves, updates } = createBackgroundHarness({ sessionState: {} });
  await listeners.startup();
  const tab = { id: 4, index: 3, windowId: 1, active: false };
  tabs.push(tab);
  await listeners.created(tab);
  assert.equal(tab.index, 0);
  assert.deepEqual(moves, [4]);
  assert.deepEqual(updates, []);
});

test('startup snapshot covers additional restored tabs in multiple windows', async () => {
  const { listeners, tabs, moves, updates } = createBackgroundHarness({ sessionState: {} });
  await listeners.created(tabs[0]);
  const secondWindow = [
    { id: 4, index: 0, windowId: 2, active: true },
    { id: 5, index: 1, windowId: 2, active: false, discarded: true },
  ];
  tabs.push(...secondWindow);
  await listeners.startup();
  await Promise.all(secondWindow.map((tab) => listeners.created(tab)));
  assert.deepEqual(moves, []);
  assert.deepEqual(updates, []);
  assert.equal(secondWindow[1].discarded, true);
});

test('late unrecognized restore events in an existing session never wake tabs', async () => {
  const { listeners, tabs, moves, updates } = createBackgroundHarness({
    sessionState: { restoredTabIds: [], restoreStartedAt: 1, restoreLastActivityAt: 1 },
    now: 86400000,
  });
  tabs[2].discarded = true;
  await listeners.created(tabs[2]);
  assert.deepEqual(moves, [3]);
  assert.deepEqual(updates, []);
  assert.equal(tabs[0].discarded, true);
  assert.equal(tabs.find((tab) => tab.id === 1).active, true);
});

test('delayed startup snapshots do not reclassify observed normal tabs', async () => {
  const { listeners, tabs, state } = createBackgroundHarness();
  await listeners.created(tabs[2]);
  await listeners.startup();
  assert.equal(state.restoredTabIds.includes(3), false);
  assert.deepEqual(state.restoredTabIds, [1, 2]);
});

test('creation waits for an in-flight startup snapshot', async () => {
  let release;
  let blockSnapshot = false;
  const pending = new Promise((resolve) => { release = resolve; });
  const { listeners, tabs, moves, updates } = createBackgroundHarness({
    queryHook: (query) => blockSnapshot && Object.keys(query).length === 0 ? pending : undefined,
  });
  await new Promise((resolve) => setImmediate(resolve));
  blockSnapshot = true;
  const startup = listeners.startup();
  const created = listeners.created(tabs[2]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(moves, []);
  release();
  await Promise.all([startup, created]);
  assert.deepEqual(moves, []);
  assert.deepEqual(updates, []);
});

test('creation waits for saved position instead of using the last default', async () => {
  let loadSettings;
  const { listeners, tabs } = createBackgroundHarness({
    syncHook: (callback) => { loadSettings = callback; },
  });
  const created = listeners.created(tabs[2]);
  loadSettings({ newTabPosition: 'first' });
  await created;
  assert.equal(tabs[0].id, 3);
});

test('first position respects pinned tabs and skips pinned or late-grouped tabs', async () => {
  const { listeners, tabs, moves, updates } = createBackgroundHarness({
    getHook: (id, liveTabs) => {
      if (id === 5) liveTabs.find((tab) => tab.id === id).groupId = 7;
    },
  });
  tabs[0].pinned = true;
  await listeners.created(tabs[0]);
  await listeners.created(tabs[2]);
  assert.equal(tabs[0].id, 1);
  assert.equal(tabs[1].id, 3);
  const grouped = { id: 5, index: 3, windowId: 1, active: false, groupId: -1 };
  tabs.push(grouped);
  await listeners.created({ ...grouped });
  assert.equal(grouped.index, 3);
  assert.deepEqual(moves, [3]);
  assert.deepEqual(updates, []);
});

test('closed restored tabs are removed from persisted identities and MRU history', async () => {
  const { listeners, tabs, state } = createBackgroundHarness({ sessionState: {} });
  await listeners.startup();
  tabs.splice(2, 1);
  await listeners.removed(3);
  assert.deepEqual(state.restoredTabIds, [1, 2]);
  assert.equal(state.mruList.includes(3), false);
});

test('empty initialized snapshots do not suppress tabs after worker wakeup', async () => {
  const fresh = createBackgroundHarness({ sessionState: {}, initialTabs: [] });
  await fresh.listeners.startup();
  assert.deepEqual(fresh.state.restoredTabIds, []);
  const restarted = createBackgroundHarness({ sessionState: fresh.state });
  await restarted.listeners.created(restarted.tabs[2]);
  assert.deepEqual(restarted.moves, [3]);
});

test('tab closure during a startup query is not reintroduced by its stale snapshot', async () => {
  let release;
  let blockSnapshot = false;
  const pending = new Promise((resolve) => { release = resolve; });
  const { listeners, tabs, state } = createBackgroundHarness({
    queryHook: (query) => blockSnapshot && Object.keys(query).length === 0 ? pending : undefined,
  });
  await new Promise((resolve) => setImmediate(resolve));
  blockSnapshot = true;
  const startup = listeners.startup();
  tabs.splice(2, 1);
  await listeners.removed(3);
  release();
  await startup;
  assert.equal(state.restoredTabIds.includes(3), false);
});

test('MRU switching still explicitly activates and focuses the target tab', async () => {
  const { listeners, tabs, updates, focuses } = createBackgroundHarness();
  await new Promise((resolve) => setImmediate(resolve));
  await listeners.activated({ tabId: 1 });
  await listeners.command('normal-switch-forward');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(updates, [2]);
  assert.deepEqual(focuses, [1]);
  assert.equal(tabs[1].active, true);
});
