/**
 * Glyph v2.0 tab state model.
 *
 * Stage 1 scaffolds the store; the Tabs UI lands in Stage 6 (see
 * V2_Plan.md §3). Stage 1 stores hold exactly one tab — all multi-tab
 * actions are still wired so switching to the multi-tab UI in Stage 6
 * is pure UI work.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

// ---------- Public types ----------

export interface Tab {
  /** Stable identifier. UUID v4 when available, random base-36 otherwise. */
  id: string;
  /** Filesystem path. `null` = Untitled, never saved. */
  path: string | null;
  /** Display name: basename of `path` or "Untitled". */
  fileName: string;
  /** Current editor buffer. */
  content: string;
  /** True when `content` differs from the last saved baseline. */
  isDirty: boolean;
  /** 1-based cursor position for the status bar. */
  cursor: { line: number; col: number };
  /** Preview pane scroll position, persisted by Stage 6. */
  scrollTop: number;
}

export interface TabsState {
  tabs: Tab[];
  activeId: string | null;
}

export interface TabsActions {
  /** Open a file by path. If a tab with that path exists, switch to it. */
  open: (path: string, content: string) => void;
  /** Close a tab; if active, the previous sibling becomes active. */
  close: (id: string) => void;
  /** Switch the active tab. */
  switchTo: (id: string) => void;
  /** Create a new Untitled tab and switch to it. */
  newUntitled: (initialContent?: string) => string;
  /** Update a tab's buffer and recompute dirty state. */
  updateContent: (id: string, content: string) => void;
  /** Update a tab's cursor position. */
  updateCursor: (id: string, cursor: { line: number; col: number }) => void;
  /** Update a tab's preview scroll position. */
  updateScrollTop: (id: string, scrollTop: number) => void;
  /**
   * Mark a tab as saved against `savedContent`. Caller passes the exact
   * bytes written to disk to avoid races with in-flight edits — if we
   * read from reducer state we could snapshot post-save typing as the
   * new baseline, leaving the buffer "clean" against the wrong version.
   */
  markSaved: (id: string, savedContent: string) => void;
  /** Update a tab's path after a Save As. */
  setPath: (id: string, path: string) => void;
  /** Reorder tabs by id list. Drag-to-reorder UI lands in Stage 6. */
  reorder: (orderedIds: string[]) => void;
  /** Reopen the most recently closed tab. Wired in Stage 6. */
  reopenLastClosed: () => void;
}

export interface TabsContextValue {
  state: TabsState;
  actions: TabsActions;
}

// ---------- Internals ----------

function generateId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older webviews).
  return `t-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const last = norm.split("/").pop() ?? path;
  return last || path;
}

function createUntitledTab(content = ""): Tab {
  return {
    id: generateId(),
    path: null,
    fileName: "Untitled",
    content,
    isDirty: false,
    cursor: { line: 1, col: 1 },
    scrollTop: 0,
  };
}

// ---------- Reducer ----------

type Action =
  | { type: "open"; id: string; path: string; content: string }
  | { type: "close"; id: string }
  | { type: "switchTo"; id: string }
  | { type: "newUntitled"; id: string; content: string }
  | { type: "updateContent"; id: string; content: string; dirty: boolean }
  | { type: "updateCursor"; id: string; cursor: { line: number; col: number } }
  | { type: "updateScrollTop"; id: string; scrollTop: number }
  | { type: "markSaved"; id: string }
  | { type: "setPath"; id: string; path: string }
  | { type: "reorder"; orderedIds: string[] };

function reducer(state: TabsState, action: Action): TabsState {
  switch (action.type) {
    case "open": {
      const existing = state.tabs.find((t) => t.path === action.path);
      if (existing) {
        return { ...state, activeId: existing.id };
      }
      const tab: Tab = {
        id: action.id,
        path: action.path,
        fileName: basename(action.path),
        content: action.content,
        isDirty: false,
        cursor: { line: 1, col: 1 },
        scrollTop: 0,
      };
      return { tabs: [...state.tabs, tab], activeId: tab.id };
    }
    case "close": {
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx === -1) return state;
      const remaining = state.tabs.filter((t) => t.id !== action.id);
      let activeId = state.activeId;
      if (state.activeId === action.id) {
        if (remaining.length === 0) {
          activeId = null;
        } else {
          const fallback = remaining[idx - 1] ?? remaining[idx] ?? remaining[0];
          activeId = fallback.id;
        }
      }
      return { tabs: remaining, activeId };
    }
    case "switchTo": {
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      return { ...state, activeId: action.id };
    }
    case "newUntitled": {
      const tab: Tab = {
        id: action.id,
        path: null,
        fileName: "Untitled",
        content: action.content,
        isDirty: false,
        cursor: { line: 1, col: 1 },
        scrollTop: 0,
      };
      return { tabs: [...state.tabs, tab], activeId: tab.id };
    }
    case "updateContent": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id
            ? { ...t, content: action.content, isDirty: action.dirty }
            : t,
        ),
      };
    }
    case "updateCursor": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, cursor: action.cursor } : t,
        ),
      };
    }
    case "updateScrollTop": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, scrollTop: action.scrollTop } : t,
        ),
      };
    }
    case "markSaved": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, isDirty: false } : t,
        ),
      };
    }
    case "setPath": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id
            ? { ...t, path: action.path, fileName: basename(action.path) }
            : t,
        ),
      };
    }
    case "reorder": {
      const byId = new Map(state.tabs.map((t) => [t.id, t] as const));
      const reordered = action.orderedIds
        .map((id) => byId.get(id))
        .filter((t): t is Tab => !!t);
      // Preserve any tabs missing from the ordered list at the end.
      const missing = state.tabs.filter((t) => !action.orderedIds.includes(t.id));
      return { ...state, tabs: [...reordered, ...missing] };
    }
    default:
      return state;
  }
}

// ---------- Context + provider ----------

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProviderProps {
  children: ReactNode;
  /** If omitted, the provider creates one Untitled tab so callers always have a document. */
  initialContent?: string;
}

export function TabsProvider({ children, initialContent }: TabsProviderProps) {
  // Seed the first tab once. Stored in a ref so a changing `initialContent`
  // prop (rare, but possible if a caller derives it) never silently replaces
  // the user's current welcome tab on re-render.
  const seedRef = useRef<Tab | null>(null);
  if (seedRef.current === null) {
    seedRef.current = createUntitledTab(initialContent ?? "");
  }
  const firstTab = seedRef.current;

  const [state, dispatch] = useReducer(reducer, {
    tabs: [firstTab],
    activeId: firstTab.id,
  });

  /** Baseline content per tab id, used to compute `isDirty` on updates. */
  const savedContentRef = useRef<Map<string, string>>(
    new Map([[firstTab.id, firstTab.content]]),
  );

  /** 10-deep ring buffer of closed tabs for Stage 6 `reopenLastClosed`. */
  const closedRef = useRef<
    Array<Pick<Tab, "path" | "content" | "fileName" | "cursor" | "scrollTop">>
  >([]);

  /** Mirror of `state.tabs` so actions can read current tabs without re-binding. */
  const tabsRef = useRef(state.tabs);
  tabsRef.current = state.tabs;

  // Actions are stable across renders — we only capture `dispatch` (stable by
  // React contract) and long-lived refs. This means consumers can safely pass
  // action references into `useEffect`/`useCallback` deps without churn.
  const actions = useMemo<TabsActions>(() => {
    return {
      open(path, content) {
        const id = generateId();
        savedContentRef.current.set(id, content);
        dispatch({ type: "open", id, path, content });
      },
      close(id) {
        const closing = tabsRef.current.find((t) => t.id === id);
        if (closing) {
          closedRef.current.unshift({
            path: closing.path,
            content: closing.content,
            fileName: closing.fileName,
            cursor: closing.cursor,
            scrollTop: closing.scrollTop,
          });
          if (closedRef.current.length > 10) {
            closedRef.current.length = 10;
          }
        }
        savedContentRef.current.delete(id);
        dispatch({ type: "close", id });
      },
      switchTo(id) {
        dispatch({ type: "switchTo", id });
      },
      newUntitled(initial = "") {
        const id = generateId();
        savedContentRef.current.set(id, initial);
        dispatch({ type: "newUntitled", id, content: initial });
        return id;
      },
      updateContent(id, content) {
        const baseline = savedContentRef.current.get(id) ?? "";
        dispatch({ type: "updateContent", id, content, dirty: content !== baseline });
      },
      updateCursor(id, cursor) {
        dispatch({ type: "updateCursor", id, cursor });
      },
      updateScrollTop(id, scrollTop) {
        dispatch({ type: "updateScrollTop", id, scrollTop });
      },
      markSaved(id, savedContent) {
        savedContentRef.current.set(id, savedContent);
        dispatch({ type: "markSaved", id });
      },
      setPath(id, path) {
        dispatch({ type: "setPath", id, path });
      },
      reorder(orderedIds) {
        // Drag-to-reorder UI lands in Stage 6; the reducer is ready.
        dispatch({ type: "reorder", orderedIds });
      },
      reopenLastClosed() {
        // No-op until Stage 6 binds the UI. Ring buffer is already populated
        // so Stage 6 inherits history from the moment it flips on.
        if (closedRef.current.length > 0) {
          console.warn(
            "[glyph] reopenLastClosed is not wired until Stage 6 Tabs UI lands",
          );
        }
      },
    };
  }, []);

  const value = useMemo<TabsContextValue>(() => ({ state, actions }), [state, actions]);
  return createElement(TabsContext.Provider, { value }, children);
}

// ---------- Hooks ----------

export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("useTabs must be used inside <TabsProvider>");
  }
  return ctx;
}

export interface ActiveTabView {
  tab: Tab | null;
  setContent: (content: string) => void;
  setCursor: (cursor: { line: number; col: number }) => void;
  setScrollTop: (top: number) => void;
  /** Assign a path after a Save As. No-op if no tab is active. */
  setPath: (path: string) => void;
  /** Mark the active tab saved against the given on-disk content. */
  markSaved: (savedContent: string) => void;
}

export function useActiveTab(): ActiveTabView {
  const { state, actions } = useTabs();
  const activeId = state.activeId;
  const tab = useMemo(
    () => state.tabs.find((t) => t.id === activeId) ?? null,
    [state.tabs, activeId],
  );

  const setContent = useCallback(
    (content: string) => {
      if (activeId) actions.updateContent(activeId, content);
    },
    [activeId, actions],
  );

  const setCursor = useCallback(
    (cursor: { line: number; col: number }) => {
      if (activeId) actions.updateCursor(activeId, cursor);
    },
    [activeId, actions],
  );

  const setScrollTop = useCallback(
    (top: number) => {
      if (activeId) actions.updateScrollTop(activeId, top);
    },
    [activeId, actions],
  );

  const setPath = useCallback(
    (path: string) => {
      if (activeId) actions.setPath(activeId, path);
    },
    [activeId, actions],
  );

  const markSaved = useCallback(
    (savedContent: string) => {
      if (activeId) actions.markSaved(activeId, savedContent);
    },
    [activeId, actions],
  );

  return { tab, setContent, setCursor, setScrollTop, setPath, markSaved };
}
