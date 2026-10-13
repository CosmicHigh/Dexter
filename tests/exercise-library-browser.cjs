const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

async function appCall(page, action) {
  return page.evaluate(source => {
    const root = document.querySelector('.dexter-app');
    const key = Object.keys(root).find(key => key.startsWith('__reactFiber$'));
    for (let fiber = root[key]; fiber; fiber = fiber.return) {
      if (fiber.stateNode?.logic) return (0, eval)(`(${source})`)(fiber.stateNode.logic);
    }
    throw new Error('Mounted Dexter logic is missing');
  }, action.toString());
}

async function main() {
  const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/Dexter.html'));
  const server = http.createServer((request, response) => {
    if (request.headers['sec-fetch-dest'] !== 'document') { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', 'text/html'); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.DEXTER_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.getByRole('tab', { name: 'Today', exact: true }).waitFor();
    const program = await appCall(page, app => app.defaultProgram());
    const history = {
      '2026-10-01': { day: 'lowerA', sets: { 'leg-extension': [{ w: 65, r: 15, done: true }] } },
      '2026-10-02': { day: 'lowerA', sets: { 'seated-leg-curl': [{ w: 40, r: 12, done: true }] } },
      '2026-10-03': { day: 'lowerB', sets: { 'seated-leg-curl-b': [{ w: 45, r: 10, done: true }] } },
    };
    program.weekPlan = Array(7).fill('lowerA');
    for (const day of program.days) for (const ex of day.exercises) {
      if (ex.id === 'seated-leg-curl') ex.name = 'Lying Leg Curl';
      if (ex.id === 'seated-leg-curl-b') ex.name = 'lying LEG curl';
    }
    await page.evaluate(data => localStorage.setItem('dexter.material.v1', JSON.stringify(data)), { program, logs: history });
    await page.reload();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog').getByText('Lower A', { exact: true }).click();
    await page.getByRole('button', { name: 'Remove exercise · Leg Extension', exact: true }).click();
    await page.getByRole('dialog').locator('.add-row').filter({ hasText: 'Add exercise' }).click();
    await page.getByRole('button', { name: 'Edit saved exercise · Leg Extension', exact: true }).click();
    await page.getByPlaceholder('Name', { exact: true }).fill('Leg Extension Revised');
    await page.getByRole('dialog').locator('textarea').fill('Saved exercise cue');
    await page.getByRole('switch', { name: 'Disc-safety note', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.setViewportSize({ width: 320, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: /^Leg Extension Revised/ }).click();
    await page.getByRole('button', { name: /^Leg Extension Revised/ }).click();
    assert.equal(await page.getByRole('dialog').locator('textarea').inputValue(), 'Saved exercise cue');
    assert.equal(await page.getByRole('switch', { name: 'Disc-safety note', exact: true }).getAttribute('aria-checked'), 'true');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Remove exercise · Leg Extension Revised', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.reload();

    await page.getByRole('button', { name: 'Add exercise for today', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Edit saved exercise · Leg Extension Revised', exact: true }).count(), 1);
    await page.getByRole('button', { name: /^Leg Extension Revised/ }).click();
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await page.locator('.select-exercise').click();
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: /lying leg curl/i }).count(), 1);
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Leg Extension Revised', exact: true }).count(), 1);
    await page.keyboard.press('Escape');

    // Merge by editing the saved definition through real controls, including blur.
    await page.getByRole('tab', { name: 'Today', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog').getByText('Lower A', { exact: true }).click();
    await page.getByRole('dialog').locator('.add-row').filter({ hasText: 'Add exercise' }).click();
    await page.getByRole('button', { name: 'Edit saved exercise · Leg Extension Revised', exact: true }).click();
    await page.getByPlaceholder('Name', { exact: true }).fill('  LYING leg curl  ');
    await page.getByPlaceholder('Primary', { exact: true }).click();
    assert.equal(await page.getByPlaceholder('Primary', { exact: true }).evaluate(input => document.activeElement === input), true, 'Merging on blur must preserve the clicked field and focus');
    assert.equal(await page.getByPlaceholder('Primary', { exact: true }).inputValue(), 'Hamstrings');
    assert.equal(await page.getByPlaceholder('Assist', { exact: true }).inputValue(), 'Calves');
    assert.equal(await page.getByRole('dialog').locator('textarea').inputValue(), program.days[0].exercises.find(ex => ex.id === 'seated-leg-curl').ref);
    await page.getByPlaceholder('Primary', { exact: true }).fill('Shared hamstrings');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await page.locator('.select-exercise').click();
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: /lying leg curl/i }).count(), 1);
    const joined = await appCall(page, app => {
      const ex = app.allLoggedExercises()[0];
      return { count: app.allLoggedExercises().length, dates: app.seriesFor(ex.id).length, saved: app.savedExercises().filter(x => app.exerciseNameKey(x.name) === app.exerciseNameKey(ex.name)).length };
    });
    assert.deepEqual(joined, { count: 1, dates: 3, saved: 1 });
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: /Delete progress \(1\)/ }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')));
    assert.deepEqual(saved.logs, history);
    assert.ok(!saved.exerciseLibrary.some(ex => /lying leg curl/i.test(ex.name)));
    await page.reload();
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await page.locator('.select-exercise').click();
    await page.getByText('No exercise progress to select. Log new sets to start tracking.', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await page.getByRole('button', { name: /Thu 1 Oct/ }).click();
    await page.getByText('65 kg × 15', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    process.stdout.write('Exercise library browser checks passed: remove, edit, re-add, daily reuse, case-insensitive merge, permanent deletion, named History and reloads.\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
