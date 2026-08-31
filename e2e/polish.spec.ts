/** M4.5 items 3, 4, 5, 7: steppers, Basics sections, hero statements, radius tokens. */

import { exampleState, expect, loadState, readState, test } from './fixtures';

// ---- item 3: steppers -------------------------------------------------------

test('money stepper: click ±$1,000, ⇧ ±$10,000, arrows step, clamps at min', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Traditional 401k balance', { exact: true });
  await page.getByLabel('Traditional 401k balance increment', { exact: true }).click();
  await expect(input).toHaveValue('1,000');
  await page.keyboard.down('Shift');
  await page.getByLabel('Traditional 401k balance increment', { exact: true }).click();
  await page.keyboard.up('Shift');
  await expect(input).toHaveValue('11,000');
  await input.click();
  await input.press('ArrowUp');
  await expect(input).toHaveValue('12,000');
  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await expect(input).toHaveValue('10,000');
  // clamp: hammer decrement well past zero
  for (let i = 0; i < 12; i++) await input.press('ArrowDown');
  await expect(input).toHaveValue('0');
  expect((await readState(page)).assumptions.balances.perFiler[0].trad401k).toBe(0);
});

test('age steps by 1 and percent by 0.1', async ({ page }) => {
  await page.goto('/');
  const age = page.getByLabel('Your age', { exact: true });
  await page.getByLabel('Your age increment', { exact: true }).click();
  await expect(age).toHaveValue('31');
  const inflation = page.getByLabel('Inflation', { exact: true });
  await page.getByLabel('Inflation increment', { exact: true }).click();
  await expect(inflation).toHaveValue('3.1');
  expect((await readState(page)).assumptions.inflation).toBeCloseTo(0.031, 10);
});

test('hold-to-repeat keeps stepping', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Cash balance', { exact: true });
  const up = page.getByLabel('Cash balance increment', { exact: true });
  const box = (await up.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800); // 400ms delay + repeats
  await page.mouse.up();
  const value = Number((await input.inputValue()).replaceAll(',', ''));
  expect(value).toBeGreaterThanOrEqual(4_000); // 1 initial + ≥3 repeats
});

// ---- item 4: Basics sections ------------------------------------------------

test('Basics sections collapse like Advanced and the collapse persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Traditional 401k balance', { exact: true })).toBeVisible();
  await page.getByText('Balances today', { exact: false }).click();
  await expect(page.getByLabel('Traditional 401k balance', { exact: true })).toHaveCount(0);
  expect((await readState(page)).display.basicsCollapsed).toEqual(['balances']);
  await page.reload();
  await expect(page.getByLabel('Traditional 401k balance', { exact: true })).toHaveCount(0);
  await page.getByText('Balances today', { exact: false }).click();
  await expect(page.getByLabel('Traditional 401k balance', { exact: true })).toBeVisible();
});

// ---- item 5: hero statements ------------------------------------------------

test('hero statements never split across lines at three widths', async ({ page }) => {
  const state = exampleState('spotcheck');
  state.assumptions.fireSpendingTarget = 40_000;
  state.assumptions.baristaIncomeTarget = 20_000;
  state.display = { ...state.display, panelWidth: 300 };
  for (const width of [1600, 1280, 1000]) {
    await page.setViewportSize({ width, height: 1000 });
    await loadState(page, state);
    const statements = page.getByTestId('hero-statement');
    const count = await statements.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i++) {
      const single = await statements.nth(i).evaluate((el) => {
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
        return el.getBoundingClientRect().height < lineHeight * 1.6;
      });
      expect(single, `statement ${i} single-line at ${width}px`).toBe(true);
    }
  }
});

// ---- item 7: radius tokens --------------------------------------------------

test('one small-radius scale everywhere — no pills on controls', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  const radius = (locator: ReturnType<typeof page.locator>) =>
    locator.first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));

  const card = await radius(page.locator('[data-slot="card"]'));
  const input = await radius(page.getByLabel('Your age', { exact: true }));
  const tab = await radius(page.getByRole('tab', { name: 'nominal' }));
  const button = await radius(page.getByRole('button', { name: 'rename' }));
  const badge = await radius(page.getByText('growth only — no withdrawals', { exact: true }).last());

  expect(card).toBeLessThanOrEqual(6.5); // cards/panels: --radius-lg 6px
  for (const [name, r] of Object.entries({ input, tab, button, badge })) {
    expect(r, `${name} radius must be on the small scale, never a pill`).toBeLessThanOrEqual(6.5);
    expect(r, `${name} radius`).toBeGreaterThanOrEqual(2);
  }
  // visual record for the gate (artifact, not a comparison baseline)
  await page.screenshot({ path: 'test-results/radius-reference.png', fullPage: false });
});
