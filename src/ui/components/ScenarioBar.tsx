/** Growth-scenario picker: select, rename, duplicate, new, delete (SPEC §3). */

import { useState } from 'react';
import type { GrowthScenario } from '../../engine/types';
import { useStore } from '../../state/store';
import { buttonCls } from './fields';

export function ScenarioBar({ scenario }: { scenario: GrowthScenario }) {
  const { state, dispatch } = useStore();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(scenario.name);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        value={scenario.id}
        onChange={(e) => dispatch({ type: 'patchDisplay', patch: { selectedScenarioId: e.target.value } })}
      >
        {state.growthScenarios.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {renaming ? (
        <>
          <input
            className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            className={buttonCls}
            onClick={() => {
              dispatch({ type: 'renameScenario', id: scenario.id, name: name.trim() || scenario.name });
              setRenaming(false);
            }}
          >
            save
          </button>
        </>
      ) : (
        <button
          type="button"
          className={buttonCls}
          onClick={() => {
            setName(scenario.name);
            setRenaming(true);
          }}
        >
          rename
        </button>
      )}
      <button type="button" className={buttonCls} onClick={() => dispatch({ type: 'duplicateScenario', id: scenario.id })}>
        duplicate
      </button>
      <button type="button" className={buttonCls} onClick={() => dispatch({ type: 'addScenario' })}>
        new
      </button>
      <button
        type="button"
        className={`${buttonCls} disabled:opacity-40`}
        disabled={state.growthScenarios.length <= 1}
        onClick={() => dispatch({ type: 'deleteScenario', id: scenario.id })}
      >
        delete
      </button>
    </div>
  );
}
