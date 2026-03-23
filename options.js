// Load saved settings and populate the form
chrome.storage.sync.get({ newTabPosition: 'last' }, (result) => {
  const radio = document.querySelector(`input[name="newTabPosition"][value="${result.newTabPosition}"]`);
  if (radio) radio.checked = true;
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
  const selected = document.querySelector('input[name="newTabPosition"]:checked');
  if (!selected) return;

  chrome.storage.sync.set({ newTabPosition: selected.value }, () => {
    const msg = document.getElementById('savedMsg');
    msg.textContent = '✓ Settings saved!';
    setTimeout(() => { msg.textContent = ''; }, 2500);
  });
});
