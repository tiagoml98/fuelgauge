/**
 * Shared e2e plumbing (M4.5 A.2): every test runs with a console guard —
 * any console error, warning, or page error after any interaction fails the
 * test. State helpers ride the URL hash (the same path the app persists on).
 */

import { expect, test as base, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import lz from 'lz-string'; // CJS — default import for the node runner
import type { PersistedState } from '../src/engine/types';

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lz;

export const test = base.extend<{ consoleGuard: string[] }>({
  consoleGuard: [
    async ({ page }, use) => {
      const bad: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          bad.push(`console.${msg.type()}: ${msg.text()}`);
        }
      });
      page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
      await use(bad);
      expect(bad, 'zero console errors and warnings after every interaction').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const encodeState = (state: unknown): string =>
  compressToEncodedURIComponent(JSON.stringify(state));

export function exampleState(
  name: 'golden' | 'spotcheck' | 'drawdown' | 'bracket' | 'ladder' | 'ladder-motivation-a' | 'ladder-motivation-b',
): PersistedState {
  return JSON.parse(readFileSync(`examples/${name}.json`, 'utf8')) as PersistedState;
}

export async function loadState(page: Page, state: unknown): Promise<void> {
  await page.goto(`/#${encodeState(state)}`);
  await page.reload(); // hash-only navigation does not re-boot the app
  await page.getByText('FuelGauge').first().waitFor();
}

/**
 * Deterministic state read: the store sets data-hash-pending synchronously
 * with every state change and clears it when the debounced write lands, so
 * "no pending flag + non-empty hash" IS quiescence — no stability guessing,
 * no stale pre-interaction hash. A repeat that failed to stop would keep the
 * flag pending forever and fail here by timeout, not by luck.
 */
export async function readState(page: Page): Promise<PersistedState> {
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute('data-hash-pending') &&
      window.location.hash.length > 1,
    undefined,
    { timeout: 15_000, polling: 100 },
  );
  const hash = await page.evaluate(() => window.location.hash.slice(1));
  const json = decompressFromEncodedURIComponent(hash);
  if (!json) throw new Error('URL hash did not decode');
  return JSON.parse(json) as PersistedState;
}

/** Commit a draft input: fill, blur, and let the hash settle. */
export async function commitInput(page: Page, ariaLabel: string, value: string): Promise<void> {
  const input = page.getByLabel(ariaLabel, { exact: true });
  await input.click();
  await input.fill(value);
  await input.blur();
}

/**
 * No visible text may clip horizontally (labels wrap; only opt-in .truncate
 * may ellipsize). PLACEHOLDERS COUNT AS TEXT (M6.2 verification): a visible
 * placeholder wider than the input's content box is a truncation.
 */
export async function expectNoTruncation(page: Page, scopeTestId: string): Promise<void> {
  const clipped = await page.evaluate((testId) => {
    const scope = document.querySelector(`[data-testid="${testId}"]`);
    if (!scope) return ['scope not found'];
    const bad: string[] = [];
    for (const el of scope.querySelectorAll<HTMLElement>('label, button, span, p, option, h3')) {
      if (el.classList.contains('truncate') || el.closest('.truncate')) continue;
      if (!el.textContent?.trim()) continue; // switch thumbs etc. — no text to clip
      if (el.children.length > 0) continue; // composites: their text LEAVES are measured instead
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        bad.push(`${el.tagName}: ${el.textContent.slice(0, 40)}`);
      }
    }
    const ctx = document.createElement('canvas').getContext('2d')!;
    for (const el of scope.querySelectorAll<HTMLInputElement>('input[placeholder]')) {
      if (el.value !== '' || el.clientWidth === 0) continue; // placeholder not showing
      const s = getComputedStyle(el);
      ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const avail = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      if (ctx.measureText(el.placeholder).width > avail + 1) {
        bad.push(`PLACEHOLDER: ${el.placeholder}`);
      }
    }
    return bad;
  }, scopeTestId);
  expect(clipped, 'no label, option, or placeholder text may truncate').toEqual([]);
}
