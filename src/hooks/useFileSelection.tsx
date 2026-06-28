import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface SelectionState {
  selected: Set<string>;
  lastSelectedId: string | null;
  scope: string | null; // surface key, e.g. "library", "organizer:Module 1"
}

interface SelectionApi {
  selected: Set<string>;
  isSelected: (id: string) => boolean;
  count: number;
  scope: string | null;
  clear: () => void;
  selectOnly: (id: string, scope: string, orderedIds: string[]) => void;
  toggle: (id: string, scope: string, orderedIds: string[]) => void;
  selectRange: (id: string, scope: string, orderedIds: string[]) => void;
  selectAll: (scope: string, orderedIds: string[]) => void;
  /** Read or replace ordered list for the active scope (used by Ctrl+A on a fresh scope). */
  getOrderedIds: () => string[];
}

const Ctx = createContext<SelectionApi | null>(null);

export function FileSelectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SelectionState>({
    selected: new Set(),
    lastSelectedId: null,
    scope: null,
  });
  const orderedRef = useRef<string[]>([]);

  const clear = useCallback(() => {
    setState({ selected: new Set(), lastSelectedId: null, scope: null });
    orderedRef.current = [];
  }, []);

  const selectOnly = useCallback((id: string, scope: string, orderedIds: string[]) => {
    orderedRef.current = orderedIds;
    setState({ selected: new Set([id]), lastSelectedId: id, scope });
  }, []);

  const toggle = useCallback((id: string, scope: string, orderedIds: string[]) => {
    orderedRef.current = orderedIds;
    setState((prev) => {
      const next = new Set(prev.scope === scope ? prev.selected : []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next, lastSelectedId: id, scope };
    });
  }, []);

  const selectRange = useCallback((id: string, scope: string, orderedIds: string[]) => {
    orderedRef.current = orderedIds;
    setState((prev) => {
      if (prev.scope !== scope || !prev.lastSelectedId) {
        return { selected: new Set([id]), lastSelectedId: id, scope };
      }
      const a = orderedIds.indexOf(prev.lastSelectedId);
      const b = orderedIds.indexOf(id);
      if (a < 0 || b < 0) return { selected: new Set([id]), lastSelectedId: id, scope };
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const range = orderedIds.slice(lo, hi + 1);
      return { selected: new Set([...prev.selected, ...range]), lastSelectedId: id, scope };
    });
  }, []);

  const selectAll = useCallback((scope: string, orderedIds: string[]) => {
    orderedRef.current = orderedIds;
    setState({ selected: new Set(orderedIds), lastSelectedId: orderedIds[orderedIds.length - 1] ?? null, scope });
  }, []);

  const api = useMemo<SelectionApi>(
    () => ({
      selected: state.selected,
      scope: state.scope,
      count: state.selected.size,
      isSelected: (id) => state.selected.has(id),
      clear,
      selectOnly,
      toggle,
      selectRange,
      selectAll,
      getOrderedIds: () => orderedRef.current,
    }),
    [state, clear, selectOnly, toggle, selectRange, selectAll],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFileSelection() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFileSelection must be used inside <FileSelectionProvider>");
  return v;
}

/** Click handler factory — adds Ctrl/Shift/click semantics. */
export function makeSelectHandler(
  api: SelectionApi,
  id: string,
  scope: string,
  orderedIds: string[],
) {
  return (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      api.selectRange(id, scope, orderedIds);
    } else if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      api.toggle(id, scope, orderedIds);
    } else {
      api.selectOnly(id, scope, orderedIds);
    }
  };
}
