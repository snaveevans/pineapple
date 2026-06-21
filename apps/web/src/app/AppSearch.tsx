import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { searchAssets, type SearchResult } from "../api/search";
import { Icon, type IconName } from "../design/Icon";
import { paths } from "../routes";
import { assetTypeLabel } from "./assetPresentation";

import "./styles/app-search.css";

type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error";

type SearchState = {
  status: SearchStatus;
  results: SearchResult[];
  error: string | null;
};

const INITIAL_STATE: SearchState = { status: "idle", results: [], error: null };

const TYPE_ICON: Record<SearchResult["type"], IconName> = {
  vehicle: "truck",
  property: "home",
  equipment: "wrench",
};

const MOBILE_MEDIA = "(max-width: 580px)";
const SEARCH_DEBOUNCE_MS = 280;

export function AppSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>(INITIAL_STATE);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const isMobile = useMediaQuery(MOBILE_MEDIA);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  const openResult = useCallback(
    (result: SearchResult) => {
      onClose();
      void navigate(paths.assetMaintenance(result.id));
    },
    [navigate, onClose],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setState(INITIAL_STATE);
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", results: [], error: null });

    const timeout = window.setTimeout(() => {
      searchAssets(trimmed, { signal: controller.signal })
        .then(({ results }) => {
          setState({ status: results.length > 0 ? "ready" : "empty", results, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) {
            onClose();
            void navigate(paths.login(), { replace: true });
            return;
          }
          setState({
            status: "error",
            results: [],
            error: error instanceof Error ? error.message : "Search could not run",
          });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, retryKey, navigate, onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, state.status]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (isMobile || state.status !== "ready") return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, state.results.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const result = state.results[selectedIndex];
        if (result) openResult(result);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isMobile, state.status, state.results, selectedIndex, onClose, openResult]);

  if (!open) return null;

  const content = isMobile ? (
    <SearchSheet
      query={query}
      setQuery={setQuery}
      state={state}
      inputRef={inputRef}
      onClose={onClose}
      onSelect={openResult}
      onRetry={retry}
    />
  ) : (
    <SearchPalette
      query={query}
      setQuery={setQuery}
      state={state}
      inputRef={inputRef}
      selectedIndex={selectedIndex}
      setSelectedIndex={setSelectedIndex}
      onClose={onClose}
      onSelect={openResult}
      onRetry={retry}
    />
  );

  return createPortal(<div className="hfs-root">{content}</div>, document.body);
}

function SearchPalette({
  query,
  setQuery,
  state,
  inputRef,
  selectedIndex,
  setSelectedIndex,
  onClose,
  onSelect,
  onRetry,
}: {
  query: string;
  setQuery: (value: string) => void;
  state: SearchState;
  inputRef: React.RefObject<HTMLInputElement | null>;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  onRetry: () => void;
}) {
  const loading = state.status === "loading";

  return (
    <div
      className="hfs-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="hfs-palette" role="dialog" aria-modal="true" aria-label="Search assets">
        <div className="hfs-search-row">
          {loading ? (
            <div className="hfs-spinner" />
          ) : (
            <Icon name="search" size={19} color="var(--hf-ink-faint)" />
          )}
          <input
            ref={inputRef}
            className="hfs-input"
            placeholder="Search assets by name, make, address, VIN..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="hfs-clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <Icon name="x" size={12} stroke={2.4} />
            </button>
          ) : (
            <span className="hfs-esc">esc</span>
          )}
        </div>

        <div className="hfs-body">
          <SearchResultsBody
            state={state}
            query={query}
            selectedIndex={selectedIndex}
            onHover={setSelectedIndex}
            onSelect={onSelect}
            onRetry={onRetry}
          />
        </div>

        <div className="hfs-footer">
          <div className="hfs-hints">
            <span className="hfs-hint">
              <span className="hfs-hint-key">↑</span>
              <span className="hfs-hint-key">↓</span>
              navigate
            </span>
            <span className="hfs-hint">
              <span className="hfs-hint-key">↵</span>
              open
            </span>
            <span className="hfs-hint">
              <span className="hfs-hint-key">esc</span>
              close
            </span>
          </div>
          <span className="hfs-footer-brand">
            <Icon name="search" size={11} color="var(--hf-brand)" />
            fleet search
          </span>
        </div>
      </div>
    </div>
  );
}

function SearchSheet({
  query,
  setQuery,
  state,
  inputRef,
  onClose,
  onSelect,
  onRetry,
}: {
  query: string;
  setQuery: (value: string) => void;
  state: SearchState;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  onRetry: () => void;
}) {
  const loading = state.status === "loading";

  return (
    <div className="hfs-sheet" role="dialog" aria-modal="true" aria-label="Search assets">
      <div className="hfs-sheet-head">
        <div className="hfs-sheet-field">
          {loading ? (
            <div className="hfs-spinner" />
          ) : (
            <Icon name="search" size={18} color="var(--hf-ink-faint)" />
          )}
          <input
            ref={inputRef}
            className="hfs-sheet-input"
            placeholder="Search your fleet..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="hfs-clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <Icon name="x" size={12} stroke={2.4} />
            </button>
          ) : null}
        </div>
        <button type="button" className="hfs-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="hfs-sheet-body">
        <SearchResultsBody
          state={state}
          query={query}
          selectedIndex={-1}
          mobile
          onSelect={onSelect}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}

function SearchResultsBody({
  state,
  query,
  selectedIndex,
  mobile = false,
  onHover,
  onSelect,
  onRetry,
}: {
  state: SearchState;
  query: string;
  selectedIndex: number;
  mobile?: boolean;
  onHover?: (index: number) => void;
  onSelect: (result: SearchResult) => void;
  onRetry: () => void;
}) {
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    rowRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, state.results]);

  if (state.status === "loading") return <SearchSkeleton />;

  if (state.status === "error") {
    return (
      <div className="hfs-state">
        <div className="hfs-state-icon" data-tone="error">
          <Icon name="alert" size={22} stroke={1.8} />
        </div>
        <div className="hfs-state-title">Search could not run</div>
        <div className="hfs-state-sub">
          {state.error ?? "Something went wrong reaching your fleet."}
        </div>
        <button type="button" className="hf-btn hf-btn-secondary hf-btn-sm" onClick={onRetry}>
          <Icon name="repeat" size={13} stroke={2} />
          Try again
        </button>
      </div>
    );
  }

  if (state.status === "idle") {
    return (
      <div className="hfs-state">
        <div className="hfs-state-icon">
          <Icon name="search" size={20} stroke={1.8} />
        </div>
        <div className="hfs-state-title">Search your assets</div>
        <div className="hfs-state-sub">
          Try a name, make, model, address, VIN, or serial number.
        </div>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="hfs-state">
        <div className="hfs-state-icon">
          <Icon name="search" size={20} stroke={1.8} />
        </div>
        <div className="hfs-state-title">
          No assets match <span className="hf-mono">{query.trim()}</span>
        </div>
        <div className="hfs-state-sub">Try fewer words or another asset detail.</div>
      </div>
    );
  }

  return (
    <>
      <div className="hfs-group-label">
        <span>Assets</span>
        <span className="hfs-group-count">
          {state.results.length} result{state.results.length === 1 ? "" : "s"}
        </span>
      </div>
      {state.results.map((result, index) => (
        <SearchResultRow
          key={result.id}
          result={result}
          query={query}
          selected={!mobile && index === selectedIndex}
          mobile={mobile}
          onSelect={onSelect}
          onHover={() => onHover?.(index)}
          refCallback={(element) => {
            rowRefs.current[index] = element;
          }}
        />
      ))}
      {state.results.length === 20 ? (
        <div className="hfs-capped">Showing the top 20. Refine your search to narrow it down.</div>
      ) : null}
    </>
  );
}

function SearchResultRow({
  result,
  query,
  selected,
  mobile,
  onSelect,
  onHover,
  refCallback,
}: {
  result: SearchResult;
  query: string;
  selected: boolean;
  mobile: boolean;
  onSelect: (result: SearchResult) => void;
  onHover: () => void;
  refCallback: (element: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      type="button"
      ref={refCallback}
      className={`hfs-result ${selected ? "sel" : ""}`}
      onClick={() => onSelect(result)}
      onMouseEnter={onHover}
    >
      <span className="hfs-result-icon" data-type={result.type}>
        <Icon name={TYPE_ICON[result.type]} size={mobile ? 21 : 18} stroke={1.6} />
      </span>
      <span className="hfs-result-main">
        <span className="hfs-result-name">{highlight(result.name, query)}</span>
        <span className="hfs-result-sub">{highlight(result.summary, query)}</span>
      </span>
      {mobile ? (
        <span className="hfs-chevron">
          <Icon name="chevron-right" size={18} />
        </span>
      ) : (
        <span className="hfs-result-trail">
          <span className="hfs-type-chip">{assetTypeLabel(result.type)}</span>
          <span className="hfs-enter">
            <Icon name="arrow-right" size={15} stroke={2} />
          </span>
        </span>
      )}
    </button>
  );
}

function SearchSkeleton() {
  return (
    <div className="hfs-skel" aria-label="Loading search results">
      {[0, 1, 2].map((index) => (
        <div className="hfs-skel-row" key={index}>
          <div className="hfs-skel-icon hfs-shimmer" />
          <div className="hfs-skel-lines">
            <div className="hfs-skel-bar w2 hfs-shimmer" />
            <div className="hfs-skel-bar w1 hfs-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

function highlight(text: string, query: string): ReactNode {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return text;

  const pattern = terms.map(escapeRegExp).join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "gi"));
  const termSet = new Set(terms);

  return parts.filter(Boolean).map((part, index) =>
    part && termSet.has(part.toLowerCase()) ? (
      <mark key={`${part}-${index}`} className="hfs-mark">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
