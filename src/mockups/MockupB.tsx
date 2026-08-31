/**
 * D.1 Direction B — "Ledger". Calm, editorial, light-first: centered column,
 * one hero sentence + figure, quiet metrics inline, inputs as a readable
 * form with descriptions, Basics/Advanced as tabs. Static — no wiring.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BalanceTable } from '../ui/components/BalanceTable';
import { GrowthChart } from '../ui/components/GrowthChart';
import { a, mock, money0, moneyM, years } from './data';

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_8.5rem] items-start gap-3 py-2.5">
      <div>
        <Label className="text-[13px] font-medium text-neutral-800">{label}</Label>
        {description && <p className="mt-0.5 text-xs leading-4 text-neutral-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}

const inputCls = 'h-8 bg-white text-right text-sm tnum';

export function MockupB() {
  const display = { real: true, ate: true, byBuckets: true, theme: 'light' as const, yearlyTable: false };
  return (
    <div className="min-h-screen bg-[#f6f5f2] font-sans text-neutral-900">
      <header className="mx-auto flex h-14 max-w-[1480px] items-center gap-6 px-6">
        <span className="text-[17px] font-bold tracking-tight">FuelGauge</span>
        <nav className="flex gap-5 text-sm">
          <span className="border-b-2 border-neutral-900 pb-0.5 font-medium">Growth</span>
          <span className="text-neutral-400">Drawdown</span>
          <span className="text-neutral-400">Compare</span>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Select defaultValue="spot">
            <SelectTrigger size="sm" className="w-60 bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spot">Spot check — match, caps, windfall</SelectItem>
              <SelectItem value="hi">Spot check — high earner</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 bg-white text-xs">Share</Button>
        </div>
      </header>
      <p className="mx-auto max-w-[1480px] px-6 pb-2 text-[11px] text-neutral-400">
        Educational model on simplifying assumptions — not tax or financial advice. Confirm real decisions with a CPA.
      </p>

      <ResizablePanelGroup orientation="horizontal" className="mx-auto min-h-[calc(100vh-6rem)] max-w-[1480px] px-6 pb-6">
        {/* inputs */}
        <ResizablePanel defaultSize={400} minSize={320} maxSize={620}>
          <aside className="h-full overflow-y-auto pr-5">
            <Tabs defaultValue="basics">
              <TabsList className="mb-2 w-full bg-neutral-200/60">
                <TabsTrigger value="basics" className="flex-1 text-xs">Basics</TabsTrigger>
                <TabsTrigger value="advanced" className="flex-1 text-xs">Advanced</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="divide-y divide-neutral-200">
              <Field label="Your age">
                <Input className={inputCls} defaultValue="30" />
              </Field>
              <Field label="Traditional 401k" description="today's balance">
                <Input className={inputCls} defaultValue="10,000" />
              </Field>
              <Field label="401k contribution" description="per year, until age 35 — capped at the 2026 limit if higher">
                <div className="flex w-[8.5rem] gap-1">
                  <Input className={inputCls} defaultValue="20,000" />
                  <Input className="h-8 w-14 bg-white text-right text-sm tnum" defaultValue="35" />
                </div>
              </Field>
              <Field label="Salary" description="drives the match and catch-up rules">
                <Input className={inputCls} defaultValue="100,000" />
              </Field>
              <Field label="Employer match" description="50¢ per $1, up to 6% of salary">
                <Input className={inputCls} defaultValue="50% → 6%" />
              </Field>
              <Field label="Investment return" description="one flat rate; step it down later if you like">
                <Input className={inputCls} defaultValue="7%" />
              </Field>
              <Field label="Inflation" description="also indexes schedules and IRS limits">
                <div className="flex w-[8.5rem] items-center justify-end gap-2">
                  <Input className="h-8 w-16 bg-white text-right text-sm tnum" defaultValue="3%" />
                  <Switch defaultChecked />
                </div>
              </Field>
              <Field label="FIRE spending target" description="what a retired year costs, today's dollars">
                <Input className={inputCls} defaultValue="40,000" />
              </Field>
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white/60 p-3 text-xs leading-5 text-neutral-500">
              <span className="font-medium text-neutral-700">Nothing in cash yet.</span> Cash earns its
              own 4% return, taxed every year. Add a cushion when you're ready — it funds the first
              bridge years in Drawdown.
            </div>
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* story */}
        <ResizablePanel>
          <main className="h-full space-y-4 overflow-y-auto pl-5">
            <Card className="gap-0 rounded-xl border-neutral-200 bg-white p-6 shadow-none">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Spot check · growth only — no withdrawals
              </p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="tnum text-[40px] font-semibold leading-none tracking-tight">
                  {moneyM(mock.totalAteRealAtHorizon)}
                </span>
                <span className="text-sm text-neutral-500">
                  after tax at {mock.horizonAge}, in today's dollars
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Your FIRE number is <strong className="tnum">{moneyM(mock.fireNumber)}</strong>{' '}
                ({money0(a.fireSpendingTarget)} a year ÷ 4%). You cross it at{' '}
                <strong>age {mock.fullFireAge ?? '—'}</strong>
                {mock.coastAge ? (
                  <>
                    {' '}— and from <strong>age {mock.coastAge}</strong> you could stop saving entirely
                    and still get there by {a.coastTargetAge}
                  </>
                ) : null}
                . First million (gross, real): <strong>age {mock.millionAge ?? '—'}</strong>.
              </p>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-1.5">
                  <Badge variant="secondary" className="text-[11px]">today's $</Badge>
                  <Badge variant="secondary" className="text-[11px]">after-tax equivalent</Badge>
                  <Badge variant="outline" className="text-[11px] text-neutral-400">buckets</Badge>
                </div>
                <span className="text-[11px] text-neutral-400">
                  dashed lines mark contribution changes · IPO lands at 40
                </span>
              </div>
              <GrowthChart years={years} a={a} display={display} />
            </Card>

            <BalanceTable years={years} a={a} display={display} onToggleYearly={() => {}} />
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
