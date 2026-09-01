/** M4.5 B.1a/B.3: draft-commit behavior of every numeric input class. */

import { commitInput, expect, loadState, readState, test } from './fixtures';
import { exampleState } from './fixtures';

test('typing a partial value never runs the engine or blanks the tab (the "55" bug)', async ({ page }) => {
  await page.goto('/');
  const age = page.getByLabel('Your age', { exact: true });
  await age.click();
  await age.selectText();
  await age.press('5'); // partial — in the old UI this committed 5 and blanked the page
  await expect(page.getByText('FuelGauge')).toBeVisible();
  let state = await readState(page);
  expect(state.assumptions.filers[0].currentAge).toBe(30); // no commit yet
  await age.press('5');
  await age.blur();
  state = await readState(page);
  expect(state.assumptions.filers[0].currentAge).toBe(55);
  await expect(page.getByText('Nothing to grow yet')).toBeVisible(); // tab alive
});

test('leading zeros are stripped and the display is formatted (B.3)', async ({ page }) => {
  await page.goto('/');
  await commitInput(page, 'Traditional 401k balance', '03000000');
  const input = page.getByLabel('Traditional 401k balance', { exact: true });
  await expect(input).toHaveValue('3,000,000');
  const state = await readState(page);
  expect(state.assumptions.balances.perFiler[0].trad401k).toBe(3_000_000);
});

test('Enter commits like blur does', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Cash balance', { exact: true });
  await input.click();
  await input.fill('25000');
  await input.press('Enter');
  await expect(input).toHaveValue('25,000');
  expect((await readState(page)).assumptions.balances.cash).toBe(25_000);
});

test('a late focus-select frame never steals focus back after commit (the parallel-run flake)', async ({ page }) => {
  // Root cause of the M6.1 flakes: onFocus scheduled rAF(select), and
  // HTMLInputElement.select() FOCUSES the element. On a busy machine the rAF
  // can fire after the user already blurred — re-opening the draft and showing
  // the raw unformatted value. Trapping rAF makes that late schedule
  // deterministic instead of load-dependent; the interactions and the
  // assertions (focus location, rendered text) are the real user-visible ones.
  await page.goto('/');
  await commitInput(page, 'Cash balance', '50000');
  const input = page.getByLabel('Cash balance', { exact: true });
  await expect(input).toHaveValue('50,000');

  await page.evaluate(() => {
    const w = window as unknown as {
      __rafTrap?: FrameRequestCallback[];
      __origRaf?: typeof requestAnimationFrame;
      requestAnimationFrame: typeof requestAnimationFrame;
    };
    w.__rafTrap = [];
    w.__origRaf = w.requestAnimationFrame.bind(window);
    w.requestAnimationFrame = (cb: FrameRequestCallback) => (w.__rafTrap!.push(cb), 0);
  });
  await input.click(); // focus → the select() callback lands in the trap
  await page.keyboard.press('Tab'); // real blur + commit while select is still pending
  await page.evaluate(() => {
    const w = window as unknown as {
      __rafTrap?: FrameRequestCallback[];
      __origRaf?: typeof requestAnimationFrame;
      requestAnimationFrame: typeof requestAnimationFrame;
    };
    w.requestAnimationFrame = w.__origRaf!;
    for (const cb of w.__rafTrap!) cb(performance.now());
  });

  await expect(input).not.toBeFocused(); // the late frame must not yank focus back
  await expect(input).toHaveValue('50,000'); // and the display stays committed-formatted
  expect((await readState(page)).assumptions.balances.cash).toBe(50_000);
});

test('invalid input shows inline validation and keeps the last good value', async ({ page }) => {
  await page.goto('/');
  await commitInput(page, 'Traditional 401k balance', '50000');
  const input = page.getByLabel('Traditional 401k balance', { exact: true });
  await input.click();
  await input.fill('abc');
  await input.blur();
  await expect(page.getByText('enter an amount')).toBeVisible();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect((await readState(page)).assumptions.balances.perFiler[0].trad401k).toBe(50_000);
  await expect(page.getByText('after tax at 90', { exact: false })).toBeVisible(); // hero survived
});

test('Escape reverts a draft without committing', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('HSA balance', { exact: true });
  await input.click();
  await input.fill('99999');
  await input.press('Escape');
  await expect(input).toHaveValue('0');
  expect((await readState(page)).assumptions.balances.perFiler[0].hsa).toBe(0);
});

test('an invalid schedule row shows the row error and the chart keeps the last good result (B.1b)', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await expect(page.locator('canvas').first()).toBeVisible();
  // spotcheck's 401k schedule opens detailed (2 rows); break row 1's end age
  await commitInput(page, '401k row 1 to age', '5');
  await expect(page.getByRole('alert').filter({ hasText: 'end age must be ≥ start age' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Fix inputs — showing the last valid result');
  await expect(page.locator('canvas').first()).toBeVisible(); // last good chart still there
  // repair it
  await commitInput(page, '401k row 1 to age', '35');
  await expect(page.getByText('Fix inputs', { exact: false })).toHaveCount(0);
});

test('percent inputs commit as decimals', async ({ page }) => {
  await page.goto('/');
  await commitInput(page, 'Inflation', '2.5');
  expect((await readState(page)).assumptions.inflation).toBeCloseTo(0.025, 10);
});
