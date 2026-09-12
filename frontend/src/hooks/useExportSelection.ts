import { useCallback, useState } from 'react';

export function useExportSelection<T extends { id: string }>(items: T[] | undefined) {
  const [exportMode, setExportMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const startExport = useCallback(() => {
    setExportMode(true);
    setSelectedIds(new Set());
  }, []);

  const cancelExport = useCallback(() => {
    setExportMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!items?.length) return;
    setSelectedIds((prev) => {
      if (prev.size === items.length) {
        return new Set();
      }
      return new Set(items.map((item) => item.id));
    });
  }, [items]);

  const allSelected = Boolean(items?.length && selectedIds.size === items.length);

  return {
    exportMode,
    selectedIds,
    selectedCount: selectedIds.size,
    allSelected,
    startExport,
    cancelExport,
    toggleSelect,
    toggleSelectAll,
  };
}
