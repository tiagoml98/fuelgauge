/** Withdrawal-strategy picker — same family as ScenarioMenu (ellipsized + tooltip). */

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
import type { WithdrawalStrategy } from '../../engine/types';
import { useStore } from '../../state/store';

export function StrategyMenu({ strategy }: { strategy: WithdrawalStrategy }) {
  const { state, dispatch } = useStore();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(strategy.name);

  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Select
              value={strategy.id}
              onValueChange={(v) => dispatch({ type: 'patchDisplay', patch: { selectedStrategyId: v } })}
            >
              <SelectTrigger size="sm" className="max-w-52 bg-white text-xs dark:bg-neutral-900" aria-label="Strategy">
                <span className="truncate">
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent className="max-w-[32rem]">
                {state.strategies.map((w) => (
                  <SelectItem key={w.id} value={w.id} className="whitespace-normal text-xs">
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-96">{strategy.name}</TooltipContent>
      </Tooltip>

      {renaming ? (
        <>
          <Input
            className="h-8 w-44 bg-white text-xs dark:bg-neutral-900"
            value={name}
            autoFocus
            aria-label="Strategy name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                dispatch({ type: 'renameStrategy', id: strategy.id, name: name.trim() || strategy.name });
                setRenaming(false);
              }
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            aria-label="save strategy name"
            onClick={() => {
              dispatch({ type: 'renameStrategy', id: strategy.id, name: name.trim() || strategy.name });
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
          aria-label="rename strategy"
          onClick={() => {
            setName(strategy.name);
            setRenaming(true);
          }}
        >
          rename
        </Button>
      )}
      <Button variant="outline" size="sm" className="h-8 bg-white text-xs dark:bg-neutral-900" aria-label="duplicate strategy" onClick={() => dispatch({ type: 'duplicateStrategy', id: strategy.id })}>
        duplicate
      </Button>
      <Button variant="outline" size="sm" className="h-8 bg-white text-xs dark:bg-neutral-900" aria-label="new strategy" onClick={() => dispatch({ type: 'addStrategy' })}>
        new
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 bg-white text-xs disabled:opacity-40 dark:bg-neutral-900"
        aria-label="delete strategy"
        disabled={state.strategies.length <= 1}
        onClick={() => dispatch({ type: 'deleteStrategy', id: strategy.id })}
      >
        delete
      </Button>
    </div>
  );
}
