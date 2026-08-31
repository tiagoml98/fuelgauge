import { describe, expect, it } from 'vitest';
import { defaultAssumptions, defaultGrowthScenario } from '../engine/defaults';
import { safeSimulate } from './derived';

describe('safeSimulate (M4.5 B.1b — invalid state yields errors, never a throw)', () => {
  it('toAge < fromAge (the typed-"55"-commits-"5" case) returns a validation error and no years', () => {
    const a = defaultAssumptions(2026);
    const g = defaultGrowthScenario(1);
    g.perFiler[0].contrib401k = [{ fromAge: 30, toAge: 5, value: 20_000 }];
    const result = safeSimulate(a, g);
    expect(result.years).toBeNull();
    expect(result.errors).toEqual([
      '401k contributions (filer 1), row 1: end age must be ≥ start age',
    ]);
  });

  it('a bad assumptions-level schedule is caught too', () => {
    const a = defaultAssumptions(2026);
    a.returnSchedule = [{ fromAge: 50, toAge: 40, value: 0.07 }];
    const result = safeSimulate(a, defaultGrowthScenario(1));
    expect(result.years).toBeNull();
    expect(result.errors[0]).toContain('Return schedule');
  });

  it('valid state simulates normally', () => {
    const result = safeSimulate(defaultAssumptions(2026), defaultGrowthScenario(1));
    expect(result.errors).toEqual([]);
    expect(result.years?.length).toBeGreaterThan(0);
  });
});
