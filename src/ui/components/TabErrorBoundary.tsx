/**
 * Per-tab error boundary (M4.5 B.1c): a blank page is never possible. State
 * lives in the URL hash, so "reset" just re-renders — the validated derived
 * layer then serves the last good result.
 */

import { Component, type ReactNode } from 'react';
import { buttonCls } from './fields';

interface State {
  error: Error | null;
}

export class TabErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-4 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-semibold">Something went wrong rendering this tab.</p>
          <p className="mt-1 text-xs">{this.state.error.message}</p>
          <button
            type="button"
            className={`${buttonCls} mt-2`}
            onClick={() => this.setState({ error: null })}
          >
            reset to last good state
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
