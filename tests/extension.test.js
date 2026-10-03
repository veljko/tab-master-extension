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

test('new link tabs are selected without moving restored or grouped tabs', async () => {
  const listeners = {};
  const tabs = [
    { id: 1, index: 0, windowId: 1, active: true, url: 'https://example.com/' },
    { id: 2, index: 1, windowId: 1, active: false, url: 'https://example.com/other' },
    { id: 3, index: 2, windowId: 1, active: false, url: 'https://example.com/new' },
  ];
  const event = (name) => ({ addListener: (listener) => { listeners[name] = listener; } });
  const chrome = {
    storage: {
      session: {
        get: async (keys) => Array.isArray(keys) ? {} : ({ mruList: tabs.map((tab) => tab.id) }),
        set: async () => {},
      },
      sync: { get: (_defaults, callback) => callback({ newTabPosition: 'first' }) },
      onChanged: event('storageChanged'),
    },
    tabs: {
      onActivated: event('activated'),
      onRemoved: event('removed'),
      onCreated: event('created'),
      query: async (query) => tabs.filter((tab) =>
        (query.windowId === undefined || tab.windowId === query.windowId)
        && (!query.active || tab.active)
        && (!query.currentWindow || tab.windowId === 1)
        && (!query.highlighted || tab.highlighted || tab.active),
      ),
      move: async (id, { index }) => {
        const [tab] = tabs.splice(tabs.findIndex((item) => item.id === id), 1);
        tabs.splice(index, 0, tab);
        tabs.forEach((item, tabIndex) => { item.index = tabIndex; });
      },
      update: async (id, properties) => {
        if (properties.active) {
          tabs.forEach((tab) => { tab.active = tab.id === id; });
        }
      },
      get: async (id) => tabs.find((tab) => tab.id === id),
    },
    runtime: { onStartup: event('startup'), onInstalled: event('installed') },
    commands: { onCommand: event('command') },
  };

  vm.runInNewContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), { chrome });

  await listeners.created(tabs.find((tab) => tab.id === 3));
  assert.equal(tabs[0].id, 3);
  assert.equal(tabs[0].active, true);

  const groupedTab = { id: 4, index: 3, windowId: 1, active: false, groupId: 7, url: 'https://example.com/grouped' };
  tabs.push(groupedTab);
  await listeners.created({ ...groupedTab, groupId: -1 });
  assert.equal(groupedTab.index, 3);
  assert.equal(groupedTab.active, false);

  await listeners.startup();
  const restoredTab = { id: 5, index: 4, windowId: 1, active: false, groupId: -1, url: 'https://example.com/restored' };
  tabs.push(restoredTab);
  await listeners.created(restoredTab);
  assert.equal(restoredTab.index, 4);
  assert.equal(restoredTab.active, false);
});
