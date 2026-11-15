export function calculateTargetIndex({ position, tab, tabs, anchorTabId }) {
  if (!tab || !Array.isArray(tabs) || tabs.length === 0) return null;
  const ordered = [...tabs].sort((a, b) => a.index - b.index);

  switch (position) {
    case 'last':
      return ordered.length - 1;
    case 'first':
      return ordered.filter((item) => item.pinned).length;
    case 'right-of-current':
    case 'left-of-current': {
      const unpinnedStart = ordered.filter((item) => item.pinned).length;
      const requestedAnchor = ordered.find((item) => item.id === anchorTabId && item.id !== tab.id);
      if (requestedAnchor?.pinned) return unpinnedStart;
      const anchor = requestedAnchor
        ?? ordered.find((item) => item.active && item.id !== tab.id && !item.pinned);
      if (!anchor) return position === 'right-of-current' ? ordered.length - 1 : unpinnedStart;
      const target = position === 'right-of-current' ? anchor.index + 1 : anchor.index;
      return Math.max(unpinnedStart, Math.min(target, ordered.length - 1));
    }
    case 'default':
    default:
      return null;
  }
}
