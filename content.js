// Intercepts Ctrl+Tab and Ctrl+Shift+Tab at the page level, preventing Edge
// from using them for its own tab cycling and routing them to the background
// service worker for MRU switching instead.
//
// This runs in the capture phase so it fires before any page script can handle
// the event. preventDefault() stops the browser from acting on Ctrl+Tab.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Tab' && !e.altKey && !e.metaKey) {
    e.preventDefault();
    e.stopImmediatePropagation();
    chrome.runtime.sendMessage({
      command: e.shiftKey ? 'normal-switch-backward' : 'quick-switch'
    });
  }
}, true);
