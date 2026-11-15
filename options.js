const DEFAULT_POSITION = 'last';

chrome.storage.sync.get({ newTabPosition: DEFAULT_POSITION }, (result) => {
  const selected = document.querySelector(`input[name="newTabPosition"][value="${result.newTabPosition}"]`);
  (selected ?? document.querySelector(`input[name="newTabPosition"][value="${DEFAULT_POSITION}"]`)).checked = true;
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const selected = document.querySelector('input[name="newTabPosition"]:checked');
  if (!selected) return;
  chrome.storage.sync.set({ newTabPosition: selected.value }, () => {
    const message = document.getElementById('savedMsg');
    message.textContent = 'Settings saved.';
    setTimeout(() => { message.textContent = ''; }, 2500);
  });
});
