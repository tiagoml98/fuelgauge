/** Balance table below the chart: every 5 years, expandable to yearly (SPEC §3). */

import { ateByAccount } from '../../engine/ate';
import { toReal } from '../../engine/schedule';
import type { Assumptions, DisplayState, RunYear } from '../../engine/types';
import { ACCOUNT_LABELS, ACCOUNT_ORDER } from '../theme/colors';
import { buttonCls } from './fields';

const money = (v: number) =>
  v === 0 ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 0 });

export function BalanceTable({
  years,
  a,
  display,
  onToggleYearly,
}: {
  years: RunYear[];
  a: Assumptions;
  display: DisplayState;
  onToggleYearly: () => void;
}) {
  const startAge = years[0]?.age ?? 0;
  const last = years[years.length - 1]?.age;
  const rows = display.yearlyTable
    ? years
    : years.filter((y) => y.age % 5 === 0 || y.age === startAge || y.age === last);
  const lens = (v: number, age: number) =>
    display.real ? toReal(v, age - startAge, a.inflation) : v;

  return (
    <div className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Balances{' '}
          <span className="font-normal text-neutral-400">
            ({display.real ? "today's $" : 'nominal'}, {display.ate ? 'ATE' : 'gross'})
          </span>
        </h3>
        <button type="button" className={buttonCls} onClick={onToggleYearly}>
          {display.yearlyTable ? 'every 5 years' : 'yearly'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs tnum">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-700">
              <th className="py-1 text-left font-normal">Age</th>
              {ACCOUNT_ORDER.map((id) => (
                <th key={id} className="py-1 pl-3 font-normal">
                  {ACCOUNT_LABELS[id]}
                </th>
              ))}
              <th className="py-1 pl-3 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="text-neutral-800 dark:text-neutral-200">
            {rows.map((y) => {
              const ate = display.ate ? ateByAccount(y.accounts, a) : null;
              return (
                <tr key={y.age} className="border-b border-neutral-100 dark:border-neutral-800">
                  <td className="py-1 text-left">{y.age}</td>
                  {ACCOUNT_ORDER.map((id) => (
                    <td key={id} className="py-1 pl-3">
                      {money(lens(ate ? ate[id] : y.accounts[id].balance, y.age))}
                    </td>
                  ))}
                  <td className="py-1 pl-3 font-semibold">
                    {money(lens(display.ate ? y.totalAte : y.total, y.age))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
