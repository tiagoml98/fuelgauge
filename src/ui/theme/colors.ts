/**
 * Bucket colors — consistent everywhere (SPEC §13). Categorical slots 1–4 of
 * the validated reference palette (dataviz skill), fixed order, both modes
 * validated with scripts/validate_palette.js:
 *   light: ΔE 24.2 PASS; aqua/yellow sub-3:1 contrast → relief = legend +
 *   tooltip + balance table (always present below the chart).
 *   dark: ΔE 10.3 floor band → 2px surface gaps between stacked fills +
 *   direct labels carry the secondary encoding.
 * Accounts wear steps of their bucket's hue — identity follows the bucket,
 * shade separates siblings (never a 5th hue).
 */

import type { AccountId, Bucket } from '../../engine/types';

export type ThemeMode = 'light' | 'dark';

export const BUCKET_ORDER: Bucket[] = ['preTax', 'roth', 'hsa', 'taxable'];

export const BUCKET_LABELS: Record<Bucket, string> = {
  preTax: 'Pre-tax',
  roth: 'Roth',
  hsa: 'HSA',
  taxable: 'Taxable',
};

export const ACCOUNT_ORDER: AccountId[] = [
  'trad401k',
  'tradIra',
  'roth401k',
  'rothIra',
  'hsa',
  'taxable',
  'cash',
];

export const ACCOUNT_LABELS: Record<AccountId, string> = {
  trad401k: 'Traditional 401k',
  tradIra: 'Traditional IRA',
  roth401k: 'Roth 401k',
  rothIra: 'Roth IRA',
  hsa: 'HSA',
  taxable: 'Invested taxable',
  cash: 'Cash',
};

export const BUCKET_COLORS: Record<ThemeMode, Record<Bucket, string>> = {
  light: { preTax: '#2a78d6', roth: '#1baf7a', hsa: '#eda100', taxable: '#008300' },
  dark: { preTax: '#3987e5', roth: '#199e70', hsa: '#c98500', taxable: '#008300' },
};

export const ACCOUNT_COLORS: Record<ThemeMode, Record<AccountId, string>> = {
  light: {
    trad401k: '#2a78d6',
    tradIra: '#6da7ec',
    roth401k: '#1baf7a',
    rothIra: '#63cfa8',
    hsa: '#eda100',
    taxable: '#008300',
    cash: '#4fae4f',
  },
  dark: {
    trad401k: '#3987e5',
    tradIra: '#86b6ef',
    roth401k: '#199e70',
    rothIra: '#63cfa8',
    hsa: '#c98500',
    taxable: '#008300',
    cash: '#4fae4f',
  },
};

/** Chart chrome & ink (reference palette instance). */
export const CHROME: Record<
  ThemeMode,
  {
    surface: string;
    page: string;
    inkPrimary: string;
    inkSecondary: string;
    inkMuted: string;
    grid: string;
    axis: string;
  }
> = {
  light: {
    surface: '#fcfcfb',
    page: '#f9f9f7',
    inkPrimary: '#0b0b0b',
    inkSecondary: '#52514e',
    inkMuted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
  },
  dark: {
    surface: '#1a1a19',
    page: '#0d0d0d',
    inkPrimary: '#ffffff',
    inkSecondary: '#c3c2b7',
    inkMuted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
  },
};
