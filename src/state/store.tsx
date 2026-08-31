/**
 * App state: one PersistedState atom + reducer. Ids are generated HERE (the
 * UI's responsibility per VARIABLES §2/§3); engine factories keep 'base'.
 * Every mutation flows through this reducer so the URL hash always reflects
 * the full state.
 */

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  defaultFiler,
  defaultFilerBalances,
  defaultFilerGrowthInputs,
  defaultGrowthScenario,
  defaultWithdrawalStrategy,
} from '../engine/defaults';
import type {
  Assumptions,
  DisplayState,
  GrowthScenario,
  PersistedState,
  WithdrawalStrategy,
} from '../engine/types';
import { loadInitialState, writeHash } from './persist';

export type Action =
  | { type: 'patchAssumptions'; patch: Partial<Assumptions> }
  | { type: 'patchScenario'; id: string; patch: Partial<GrowthScenario> }
  | { type: 'addScenario' }
  | { type: 'duplicateScenario'; id: string }
  | { type: 'renameScenario'; id: string; name: string }
  | { type: 'deleteScenario'; id: string }
  | { type: 'patchStrategy'; id: string; patch: Partial<WithdrawalStrategy> }
  | { type: 'addStrategy' }
  | { type: 'duplicateStrategy'; id: string }
  | { type: 'renameStrategy'; id: string; name: string }
  | { type: 'deleteStrategy'; id: string }
  | { type: 'setFilerCount'; count: 1 | 2 }
  | { type: 'patchDisplay'; patch: Partial<DisplayState> }
  | { type: 'replaceState'; state: PersistedState };

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

export function reducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case 'patchAssumptions':
      return { ...state, assumptions: { ...state.assumptions, ...action.patch } };
    case 'patchScenario':
      return {
        ...state,
        growthScenarios: state.growthScenarios.map((g) =>
          g.id === action.id ? { ...g, ...action.patch } : g,
        ),
      };
    case 'addScenario': {
      const g = defaultGrowthScenario(state.assumptions.filers.length, newId());
      g.name = `Scenario ${state.growthScenarios.length + 1}`;
      return {
        ...state,
        growthScenarios: [...state.growthScenarios, g],
        display: { ...state.display, selectedScenarioId: g.id },
      };
    }
    case 'duplicateScenario': {
      const source = state.growthScenarios.find((g) => g.id === action.id);
      if (!source) return state;
      const copy: GrowthScenario = structuredClone(source);
      copy.id = newId();
      copy.name = `${source.name} (copy)`;
      return {
        ...state,
        growthScenarios: [...state.growthScenarios, copy],
        display: { ...state.display, selectedScenarioId: copy.id },
      };
    }
    case 'renameScenario':
      return {
        ...state,
        growthScenarios: state.growthScenarios.map((g) =>
          g.id === action.id ? { ...g, name: action.name } : g,
        ),
      };
    case 'deleteScenario': {
      if (state.growthScenarios.length <= 1) return state; // never delete the last one
      const remaining = state.growthScenarios.filter((g) => g.id !== action.id);
      return {
        ...state,
        growthScenarios: remaining,
        display: { ...state.display, selectedScenarioId: remaining[0].id },
      };
    }
    case 'patchStrategy':
      return {
        ...state,
        strategies: state.strategies.map((w) => (w.id === action.id ? { ...w, ...action.patch } : w)),
      };
    case 'addStrategy': {
      const w = defaultWithdrawalStrategy(state.assumptions, newId());
      w.name = `Strategy ${state.strategies.length + 1}`;
      return {
        ...state,
        strategies: [...state.strategies, w],
        display: { ...state.display, selectedStrategyId: w.id },
      };
    }
    case 'duplicateStrategy': {
      const source = state.strategies.find((w) => w.id === action.id);
      if (!source) return state;
      const copy: WithdrawalStrategy = structuredClone(source);
      copy.id = newId();
      copy.name = `${source.name} (copy)`;
      return {
        ...state,
        strategies: [...state.strategies, copy],
        display: { ...state.display, selectedStrategyId: copy.id },
      };
    }
    case 'renameStrategy':
      return {
        ...state,
        strategies: state.strategies.map((w) => (w.id === action.id ? { ...w, name: action.name } : w)),
      };
    case 'deleteStrategy': {
      if (state.strategies.length <= 1) return state; // never delete the last one
      const remaining = state.strategies.filter((w) => w.id !== action.id);
      return {
        ...state,
        strategies: remaining,
        display: { ...state.display, selectedStrategyId: remaining[0].id },
      };
    }
    case 'setFilerCount': {
      const a = state.assumptions;
      if (a.filers.length === action.count) return state;
      const filers = action.count === 2 ? [...a.filers, defaultFiler()] : [a.filers[0]];
      const perFiler =
        action.count === 2
          ? [...a.balances.perFiler, defaultFilerBalances()]
          : [a.balances.perFiler[0]];
      return {
        ...state,
        assumptions: {
          ...a,
          filers,
          filingStatus: action.count === 2 ? 'marriedJoint' : 'single',
          balances: { ...a.balances, perFiler },
        },
        // every scenario's per-filer inputs stay aligned with the filer list
        growthScenarios: state.growthScenarios.map((g) => ({
          ...g,
          perFiler:
            action.count === 2
              ? [...g.perFiler, defaultFilerGrowthInputs()]
              : [g.perFiler[0]],
        })),
      };
    }
    case 'patchDisplay':
      return { ...state, display: { ...state.display, ...action.patch } };
    case 'replaceState':
      return action.state;
  }
}

const StoreContext = createContext<{ state: PersistedState; dispatch: Dispatch<Action> } | null>(
  null,
);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  // Debounced URL-hash writeback — the URL always holds the full state
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => writeHash(state), 300);
    return () => clearTimeout(timer.current);
  }, [state]);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

/** The scenario being edited: selected id, else the first. */
export function useSelectedScenario(): GrowthScenario {
  const { state } = useStore();
  return (
    state.growthScenarios.find((g) => g.id === state.display.selectedScenarioId) ??
    state.growthScenarios[0]
  );
}

/** The strategy being edited: selected id, else the first. */
export function useSelectedStrategy(): WithdrawalStrategy {
  const { state } = useStore();
  return (
    state.strategies.find((w) => w.id === state.display.selectedStrategyId) ?? state.strategies[0]
  );
}
