/** Shared collapsible section — one component for Basics and Advanced (M4.5 item 4). */

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { type ReactNode } from 'react';

export function Group({
  title,
  hint,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className="border-b border-neutral-200 py-2 dark:border-neutral-800"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between py-1 text-left">
        <div>
          <h3 className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">{title}</h3>
          {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
        </div>
        <span className="text-neutral-400 transition-transform group-data-[state=open]:rotate-45">＋</span>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
