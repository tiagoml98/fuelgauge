/**
 * D.1 Direction A — "Instrument panel". Dense, dark-first, data-forward:
 * slim header, stat row above a hero chart, resizable rail with
 * Basics-then-Advanced disclosure. Static — no wiring.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BalanceTable } from '../ui/components/BalanceTable';
import { GrowthChart } from '../ui/components/GrowthChart';
import { a, mock, money0, moneyM, years } from './data';

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="gap-1 rounded-lg border-neutral-800 bg-[#1a1a19] px-4 py-3 shadow-none">
      <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="tnum text-2xl font-semibold text-neutral-50">{value}</div>
      <div className="text-[11px] text-neutral-500">{hint}</div>
    </Card>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-neutral-400">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-4 text-neutral-600">{hint}</p>}
    </div>
  );
}

const inputCls = 'h-8 border-neutral-800 bg-neutral-900 text-sm text-neutral-100 tnum';

export function MockupA() {
  return (
    <div className="dark min-h-screen bg-[#0d0d0d] font-sans text-neutral-100">
      {/* header */}
      <header className="flex h-12 items-center gap-4 border-b border-neutral-800/80 px-4">
        <span className="text-[15px] font-bold tracking-tight">FuelGauge</span>
        <Tabs defaultValue="growth">
          <TabsList className="h-8 bg-neutral-900">
            <TabsTrigger value="growth" className="text-xs">Growth</TabsTrigger>
            <TabsTrigger value="drawdown" className="text-xs" disabled>Drawdown</TabsTrigger>
            <TabsTrigger value="compare" className="text-xs" disabled>Compare</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <Select defaultValue="spot">
            <SelectTrigger size="sm" className="w-56 border-neutral-800 bg-neutral-900 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spot">Spot check — match, caps, windfall</SelectItem>
              <SelectItem value="hi">Spot check — high earner</SelectItem>
            </SelectContent>
          </Select>
          <Tabs defaultValue="real">
            <TabsList className="h-8 bg-neutral-900">
              <TabsTrigger value="real" className="text-xs">today's $</TabsTrigger>
              <TabsTrigger value="nominal" className="text-xs">nominal</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="ate">
            <TabsList className="h-8 bg-neutral-900">
              <TabsTrigger value="ate" className="text-xs">after-tax</TabsTrigger>
              <TabsTrigger value="gross" className="text-xs">gross</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" className="h-8 border-neutral-800 text-xs">Share</Button>
        </div>
      </header>
      <p className="border-b border-amber-950 bg-[#1c1303] px-4 py-1 text-center text-[11px] text-amber-300/90">
        Educational model on simplifying assumptions — not tax or financial advice. Confirm real decisions with a CPA.
      </p>

      <ResizablePanelGroup orientation="horizontal" className="min-h-[calc(100vh-6rem)]">
        {/* rail */}
        <ResizablePanel defaultSize={330} minSize={260} maxSize={520}>
          <aside className="h-full space-y-5 overflow-y-auto border-r border-neutral-800/80 p-4">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Basics</h2>
              <p className="mt-0.5 text-[11px] text-neutral-600">Enough for a first chart — a minute, no surprises.</p>
            </div>
            <Field label="Your age">
              <Input className={inputCls} defaultValue="30" />
            </Field>
            <Field label="Traditional 401k balance">
              <Input className={inputCls} defaultValue="10,000" />
            </Field>
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
              <Field label="401k contribution / yr">
                <Input className={inputCls} defaultValue="20,000" />
              </Field>
              <Field label="until age">
                <Input className={inputCls} defaultValue="35" />
              </Field>
            </div>
            <Field label="Salary" hint="drives the employer match and the Roth catch-up rule">
              <Input className={inputCls} defaultValue="100,000" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Match">
                <Input className={inputCls} defaultValue="50% to 6%" />
              </Field>
              <Field label="Return / yr">
                <Input className={inputCls} defaultValue="7%" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Inflation">
                <Input className={inputCls} defaultValue="3%" />
              </Field>
              <Field label="FIRE spending target">
                <Input className={inputCls} defaultValue="40,000" />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2">
              <span className="text-xs text-neutral-400">Index with inflation</span>
              <Switch defaultChecked />
            </div>
            <div className="rounded-md border border-dashed border-neutral-800 px-3 py-2 text-[11px] leading-4 text-neutral-500">
              Cash sits empty — it earns its own 4% return, taxed yearly. Add a cushion in Advanced.
            </div>
            <Separator className="bg-neutral-800/80" />
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                <div>
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Advanced</h2>
                  <p className="mt-0.5 text-[11px] text-neutral-600">
                    Limits · detailed schedules · Roth sub-balances · return overrides · access ages
                  </p>
                </div>
                <span className="text-neutral-600">＋</span>
              </CollapsibleTrigger>
              <CollapsibleContent />
            </Collapsible>
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-neutral-800/80" />

        {/* main */}
        <ResizablePanel>
          <main className="h-full space-y-3 overflow-y-auto p-4">
            <div className="grid grid-cols-4 gap-3">
              <Stat label="At 62, after tax" value={moneyM(mock.totalAteRealAtHorizon)} hint="today's dollars, growth only" />
              <Stat label="FIRE number" value={moneyM(mock.fireNumber)} hint={`${money0(a.fireSpendingTarget)} ÷ 4% SWR`} />
              <Stat label="Coast FIRE" value={mock.coastAge ? `age ${mock.coastAge}` : '—'} hint={`stop saving, still there by ${a.coastTargetAge}`} />
              <Stat label="$1M (gross)" value={mock.millionAge ? `age ${mock.millionAge}` : '—'} hint="real dollars" />
            </div>

            <Card className="gap-0 rounded-lg border-neutral-800 bg-[#1a1a19] p-3 shadow-none">
              <div className="flex items-center justify-between px-1 pb-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Portfolio by bucket</h3>
                  <Badge variant="outline" className="border-neutral-700 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                    growth only — no withdrawals
                  </Badge>
                </div>
                <Tabs defaultValue="buckets">
                  <TabsList className="h-7 bg-neutral-900">
                    <TabsTrigger value="buckets" className="text-[11px]">buckets</TabsTrigger>
                    <TabsTrigger value="accounts" className="text-[11px]">accounts</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <GrowthChart years={years} a={a} display={{ real: true, ate: true, byBuckets: true, theme: 'dark', yearlyTable: false }} />
            </Card>

            <BalanceTable
              years={years}
              a={a}
              display={{ real: true, ate: true, byBuckets: true, theme: 'dark', yearlyTable: false }}
              onToggleYearly={() => {}}
            />
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
