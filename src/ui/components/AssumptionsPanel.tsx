/**
 * The always-visible assumptions panel + disclaimer (SPEC §10). Renders
 * docs/ASSUMPTIONS.md via a ?raw import — one source of truth; the in-app
 * panel structurally cannot drift from the doc (CLAUDE.md same-commit rule).
 */

import { useState } from 'react';
import assumptionsMd from '../../../docs/ASSUMPTIONS.md?raw';
import { buttonCls } from './fields';

const strip = (s: string) => s.replaceAll('**', '').trim();

function MiniMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let table: string[][] = [];
  const flushTable = (key: number) => {
    if (table.length === 0) return;
    const [head, ...body] = table;
    blocks.push(
      <table key={key} className="my-2 w-full text-left text-xs">
        <thead>
          <tr className="border-b border-neutral-300 text-neutral-500 dark:border-neutral-600">
            {head.map((h, i) => (
              <th key={i} className="py-1 pr-3 font-medium">
                {strip(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i} className="border-b border-neutral-100 align-top dark:border-neutral-800">
              {row.map((cell, j) => (
                <td key={j} className="py-1 pr-3">
                  {strip(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    );
    table = [];
  };
  text.split('\n').forEach((line, n) => {
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1);
      if (!cells.every((c) => /^\s*-+\s*$/.test(c))) table.push(cells);
      return;
    }
    flushTable(n);
    if (line.startsWith('> ')) {
      blocks.push(
        <p
          key={n}
          className="my-2 rounded border-l-4 border-amber-500 bg-amber-50 p-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {strip(line.slice(2))}
        </p>,
      );
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h4 key={n} className="mt-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {strip(line.slice(3))}
        </h4>,
      );
    } else if (line.startsWith('# ')) {
      // file title — panel has its own heading
    } else if (line.trim()) {
      blocks.push(
        <p key={n} className="my-1 text-xs text-neutral-600 dark:text-neutral-400">
          {strip(line)}
        </p>,
      );
    }
  });
  flushTable(text.length);
  return <>{blocks}</>;
}

export function AssumptionsPanel() {
  const [open, setOpen] = useState(false);
  const disclaimerLine = assumptionsMd.split('\n').find((l) => l.startsWith('> '));
  return (
    <div className="rounded-[4px] bg-white p-3 dark:bg-[#1b1b1a]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Assumptions & simplifications
        </h3>
        <button type="button" className={buttonCls} onClick={() => setOpen(!open)}>
          {open ? 'collapse' : 'show all'}
        </button>
      </div>
      {!open && disclaimerLine && (
        <p className="mt-2 rounded border-l-4 border-amber-500 bg-amber-50 p-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {strip(disclaimerLine.slice(2))}
        </p>
      )}
      {open && <MiniMarkdown text={assumptionsMd} />}
    </div>
  );
}
