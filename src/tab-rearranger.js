export function createTabRearranger() {
  async function highlightedTabs() {
    const tabs = await chrome.tabs.query({ highlighted: true, currentWindow: true });
    return tabs.sort((a, b) => a.index - b.index);
  }

  async function move(direction) {
    const selected = await highlightedTabs();
    if (!selected.length) return;
    const all = await chrome.tabs.query({ currentWindow: true });
    const first = selected[0].index;
    const last = selected[selected.length - 1].index;
    const selectedPinned = selected[0].pinned;
    if (selected.some((tab) => tab.pinned !== selectedPinned)) return;

    const pinnedCount = all.filter((tab) => tab.pinned).length;
    const boundary = selectedPinned ? pinnedCount - 1 : all.length - 1;
    const target = direction < 0 ? first - 1 : first + 1;
    if (direction < 0 && first <= (selectedPinned ? 0 : pinnedCount)) return;
    if (direction > 0 && last >= boundary) return;
    await chrome.tabs.move(selected.map((tab) => tab.id), { index: target });
  }

  async function moveToEdge(edge) {
    const selected = await highlightedTabs();
    if (!selected.length) return;
    const all = await chrome.tabs.query({ currentWindow: true });
    const selectedPinned = selected[0].pinned;
    if (selected.some((tab) => tab.pinned !== selectedPinned)) return;

    const selectedIndices = selected.map((tab) => tab.index);
    const isContiguous = selectedIndices.every((index, offset) =>
      offset === 0 || index === selectedIndices[offset - 1] + 1
    );
    if (!isContiguous) return;

    const pinnedCount = all.filter((tab) => tab.pinned).length;
    const target = edge === 'first'
      ? selectedPinned ? 0 : pinnedCount
      : selectedPinned
        ? Math.max(0, pinnedCount - selected.length)
        : Math.max(pinnedCount, all.length - selected.length);
    const currentStart = selected[0].index;
    if (currentStart === target) return;
    await chrome.tabs.move(selected.map((tab) => tab.id), { index: target });
  }

  return { move, moveToEdge };
}
