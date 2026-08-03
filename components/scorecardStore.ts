/**
 * Global scorecard lookup store + React context.
 * Vanilla pages can use `scorecardStore`; React trees use `ScorecardProvider`.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  RepresentativeScorecardPayload,
  RepresentativesLookupResult,
} from "../lib/services/scorecardService";

export type ScorecardLookupStatus = "idle" | "loading" | "success" | "error";

export interface ScorecardState {
  status: ScorecardLookupStatus;
  query: string;
  data: RepresentativesLookupResult | null;
  error: string | null;
  representatives: RepresentativeScorecardPayload[];
}

type Listener = () => void;

const initialState: ScorecardState = {
  status: "idle",
  query: "",
  data: null,
  error: null,
  representatives: [],
};

let state: ScorecardState = { ...initialState };
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const scorecardStore = {
  getState(): ScorecardState {
    return state;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setState(patch: Partial<ScorecardState>) {
    state = { ...state, ...patch };
    if (typeof window !== "undefined") {
      (window as Window & { __article1Scorecard?: ScorecardState }).__article1Scorecard =
        state;
      window.dispatchEvent(
        new CustomEvent("article1:scorecard", { detail: state })
      );
    }
    emit();
  },
  reset() {
    state = { ...initialState };
    if (typeof window !== "undefined") {
      (window as Window & { __article1Scorecard?: ScorecardState }).__article1Scorecard =
        state;
      window.dispatchEvent(
        new CustomEvent("article1:scorecard", { detail: state })
      );
    }
    emit();
  },
  setLoading(query: string) {
    this.setState({
      status: "loading",
      query,
      error: null,
    });
  },
  setSuccess(query: string, data: RepresentativesLookupResult) {
    this.setState({
      status: "success",
      query,
      data,
      error: null,
      representatives: data.representatives || [],
    });
  },
  setError(query: string, error: string) {
    this.setState({
      status: "error",
      query,
      error,
      data: null,
      representatives: [],
    });
  },
};

export function useScorecardStore(): ScorecardState {
  return useSyncExternalStore(
    scorecardStore.subscribe,
    scorecardStore.getState,
    scorecardStore.getState
  );
}

interface ScorecardContextValue extends ScorecardState {
  setLoading: (query: string) => void;
  setSuccess: (query: string, data: RepresentativesLookupResult) => void;
  setError: (query: string, error: string) => void;
  reset: () => void;
}

const ScorecardContext = createContext<ScorecardContextValue | null>(null);

export function ScorecardProvider({ children }: { children: ReactNode }) {
  const snapshot = useScorecardStore();
  const value: ScorecardContextValue = {
    ...snapshot,
    setLoading: useCallback((query) => scorecardStore.setLoading(query), []),
    setSuccess: useCallback(
      (query, data) => scorecardStore.setSuccess(query, data),
      []
    ),
    setError: useCallback(
      (query, error) => scorecardStore.setError(query, error),
      []
    ),
    reset: useCallback(() => scorecardStore.reset(), []),
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as Window & { __article1Scorecard?: ScorecardState }).__article1Scorecard =
        snapshot;
    }
  }, [snapshot]);

  return (
    <ScorecardContext.Provider value={value}>
      {children}
    </ScorecardContext.Provider>
  );
}

export function useScorecard(): ScorecardContextValue {
  const ctx = useContext(ScorecardContext);
  const snapshot = useScorecardStore();
  const fallback: ScorecardContextValue = {
    ...snapshot,
    setLoading: (query) => scorecardStore.setLoading(query),
    setSuccess: (query, data) => scorecardStore.setSuccess(query, data),
    setError: (query, error) => scorecardStore.setError(query, error),
    reset: () => scorecardStore.reset(),
  };
  return ctx || fallback;
}
