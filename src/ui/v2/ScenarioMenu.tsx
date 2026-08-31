/**
 * Scenario picker (M4.5 D.1 adjustment #2): trigger ellipsizes with a
 * tooltip carrying the full name; the open menu shows full names untruncated.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useState } from 'react';
import { useStore } from '../../state/store';
import type { GrowthScenario } from '../../engine/types';

export function ScenarioMenu({ scenario }: { scenario: GrowthScenario }) {
  const { state, dispatch } = useStore();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(scenario.name);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Select
              value={scenario.id}
              onValueChange={(v) => dispatch({ type: 'patchDisplay', patch: { selectedScenarioId: v } })}
            >
              <SelectTrigger size="sm" className="max-w-64 bg-white text-xs dark:bg-neutral-900" aria-label="Scenario">
                <span className="truncate">
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent className="max-w-[32rem]">
                {state.growthScenarios.map((g) => (
                  <SelectItem key={g.id} value={g.id} className="whitespace-normal text-xs">
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-96">{scenario.name}</TooltipContent>
      </Tooltip>

      {renaming ? (
        <>
          <Input
            className="h-8 w-56 bg-white text-xs dark:bg-neutral-900"
            value={name}
            autoFocus
            aria-label="Scenario name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                dispatch({ type: 'renameScenario', id: scenario.id, name: name.trim() || scenario.name });
                setRenaming(false);
              }
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              dispatch({ type: 'renameScenario', id: scenario.id, name: name.trim() || scenario.name });
              setRenaming(false);
            }}
          >
            save
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 bg-white text-xs dark:bg-neutral-900"
          onClick={() => {
            setName(scenario.name);
            setRenaming(true);
          }}
        >
          rename
        </Button>
      )}
      <Button variant="outline" size="sm" className="h-8 bg-white text-xs dark:bg-neutral-900" onClick={() => dispatch({ type: 'duplicateScenario', id: scenario.id })}>
        duplicate
      </Button>
      <Button variant="outline" size="sm" className="h-8 bg-white text-xs dark:bg-neutral-900" onClick={() => dispatch({ type: 'addScenario' })}>
        new
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 bg-white text-xs disabled:opacity-40 dark:bg-neutral-900"
        disabled={state.growthScenarios.length <= 1}
        onClick={() => dispatch({ type: 'deleteScenario', id: scenario.id })}
      >
        delete
      </Button>
    </div>
  );
}
