/**
 * Access ages (SPEC §2, M3). All ages are the owner's OWN age; the map's
 * missing keys mean accessible from the start (taxable, cash, Roth basis).
 *
 * Rounding (M0 gate #17, operationalized at M3): a source is open in the
 * first year whose END-of-year age ≥ ceil(access age) — 59½ → the year they
 * turn 60; rule-of-55 at 56 → the year they turn 56. Within ±6 months of the
 * true date (Jan–Jun birthdays can unlock up to six months early) — M7.
 */

import { separationAge } from './accumulate';
import {
  HSA_CONTRIBUTION_STOP_AGE,
  PRETAX_ACCESS_AGE,
  RMD_AGE_BORN_1951_TO_1959,
  RMD_AGE_BORN_1960_PLUS,
  ROTH_SEASONING_YEARS,
  RULE_OF_55_MIN_SEPARATION,
} from './defaults';
import type { AccessMap, Assumptions, GrowthScenario, RothConversion } from './types';

/** Is a source open in the year ending at `endOfYearAge`? Missing access age = always open. */
export function accessOpen(endOfYearAge: number, accessAge: number | undefined): boolean {
  return accessAge === undefined || endOfYearAge >= Math.ceil(accessAge);
}

/**
 * Per filer: trad401k honors the rule of 55 from the SCENARIO's separation age
 * (gate #2); overrides (SPEC §2 "editable auto-fill") win over everything.
 * rothEarnings carries only the 59½ component here — the 5-year-clock
 * component depends on runtime state (first funded year) and is resolved by
 * run.ts via rothEarningsOpen().
 */
export function computeAccessAges(a: Assumptions, g: GrowthScenario): AccessMap {
  const n = a.horizonAge - a.filers[0].currentAge;
  return a.filers.map((filer, f) => {
    const override = a.accessAgeOverrides?.[f] ?? {};
    const separation = separationAge(g, f, filer.currentAge, filer.currentAge + n);
    // M9.1 #1: the rule of 55 only ever OPENS EARLIER — a late separation
    // (salary to the horizon) must never push access past 59½
    const ruleOf55 =
      separation !== null && separation >= RULE_OF_55_MIN_SEPARATION
        ? Math.min(separation, PRETAX_ACCESS_AGE)
        : PRETAX_ACCESS_AGE;
    return {
      trad401k: override.trad401k ?? ruleOf55,
      tradIra: override.tradIra ?? PRETAX_ACCESS_AGE,
      rothEarnings: PRETAX_ACCESS_AGE,
      ...(a.hsaTreatment === 'nonMedical' ? { hsa: HSA_CONTRIBUTION_STOP_AGE } : {}),
    };
  });
}

/**
 * Roth earnings need BOTH: age ≥ 59½ (per the map) and 5 years since the
 * owner's first funding (a rollover counts as funding — ASSUMPTIONS M11).
 */
export function rothEarningsOpen(
  endOfYearAge: number,
  inYear: number,
  ageComponent: number | undefined,
  firstFundedYear: number | null,
): boolean {
  if (!accessOpen(endOfYearAge, ageComponent)) return false;
  if (firstFundedYear === null) return false; // no funding ⇒ no earnings to draw anyway
  return inYear >= firstFundedYear + ROTH_SEASONING_YEARS;
}

/**
 * Gate #4, corrected at the M8 plan approval: the accessible amount of one
 * conversion in a given year — the nontaxable portion immediately, the
 * taxable portion at the EARLIER of five tax years after conversion or the
 * year the owner reaches ⌈59.5⌉. The 5-year conversion clock only ever gates
 * the 10% early-withdrawal penalty, which never applies past 59½. (The
 * separate 5-year rule on Roth EARNINGS — rothEarningsOpen — is unchanged.)
 */
export function accessibleConversionAmount(
  c: RothConversion,
  inYear: number,
  ownerEndOfYearAge: number,
): number {
  const nontaxable = c.amount - c.taxablePortion;
  const taxableOpen =
    inYear >= c.year + ROTH_SEASONING_YEARS ||
    ownerEndOfYearAge >= Math.ceil(PRETAX_ACCESS_AGE);
  return nontaxable + (taxableOpen ? c.taxablePortion : 0);
}

/**
 * M8: the calendar year a conversion made in `inYear` (owner's end-of-year
 * age `ownerAge`) becomes fully accessible, per the rule above.
 */
export function conversionUnlockYear(inYear: number, ownerAge: number): number {
  const ceil = Math.ceil(PRETAX_ACCESS_AGE);
  if (ownerAge >= ceil) return inYear;
  return Math.min(inYear + ROTH_SEASONING_YEARS, inYear + (ceil - ownerAge));
}

/** SPEC §2: 73 for those born 1951–59, 75 for 1960+. Consumed by rmd.ts (M10). */
export function rmdStartAge(birthYear: number): 73 | 75 {
  return birthYear >= 1960 ? RMD_AGE_BORN_1960_PLUS : RMD_AGE_BORN_1951_TO_1959;
}
