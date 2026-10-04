const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

async function appCall(page, action) {
  return page.evaluate(source => {
    const node = document.querySelector('.dexter-app');
    const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'));
    for (let fiber = node[key]; fiber; fiber = fiber.return) {
      if (fiber.stateNode?.logic) { window.__interactionApp = fiber.stateNode.logic; return (0, eval)(`(${source})`)(fiber.stateNode.logic); }
    }
    throw new Error('Mounted Dexter logic is missing');
  }, action.toString());
}

async function settled(page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function contrast(foreground, background) {
  function luminance(color) {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      value /= 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  }
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
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
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('tab', { name: 'Today', exact: true }).waitFor();
    const cdp = await context.newCDPSession(page);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
    const today = await page.getByRole('tab', { name: 'Today', exact: true }).boundingBox();
    const history = await page.getByRole('tab', { name: 'History', exact: true }).boundingBox();
    const start = { x: today.x + today.width / 2, y: today.y + today.height / 2 };
    const end = { x: history.x + history.width / 2, y: start.y };

    // Interrupt a real captured touch gesture with a live OS accessibility change.
    await touch('touchStart', start); await touch('touchMove', end);
    assert.equal(await appCall(page, app => app._navGesture?.preview), 'history');
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.waitForFunction(() => document.querySelector('.dexter-app').dataset.reduceMotion === 'true');
    await touch('touchCancel');
    const interrupted = await appCall(page, app => ({ tab: app.state.tab, gesture: app._navGesture, x: parseFloat(app._nodes.nav.style.getPropertyValue('--nav-x')), actualX: new DOMMatrixReadOnly(getComputedStyle(app._nodes.nav.querySelector('.nav-indicator')).transform).m41, selected: app._navRects.find(row => row.id === app.state.tab).x }));
    assert.equal(interrupted.tab, 'today'); assert.equal(interrupted.gesture, null);
    assert.equal(interrupted.x, interrupted.selected, 'Cancelled motion must restore the indicator to the selected tab');
    assert.equal(interrupted.actualX, interrupted.selected, 'Reduced motion must settle the displayed indicator immediately');
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await page.waitForFunction(() => document.querySelector('.dexter-app').dataset.reduceMotion === 'false');
    await touch('touchStart', start); await touch('touchMove', end);
    assert.equal(await appCall(page, app => app._navGesture?.preview), 'history');
    await touch('touchEnd');
    await page.waitForFunction(() => document.querySelector('[data-tab="history"]').getAttribute('aria-selected') === 'true');
    assert.equal(await page.getByRole('tab', { name: 'History', exact: true }).getAttribute('aria-selected'), 'true', 'A subsequent drag must still commit');
    await page.getByRole('tab', { name: 'Today', exact: true }).click();
    await settled(page);
    const traveling = await page.getByRole('tab', { name: 'Cardio', exact: true }).evaluate(button => {
      button.click();
      return document.querySelector('.nav-indicator').getAnimations().some(animation => animation.playState === 'running');
    });
    assert.equal(traveling, true, 'A normal tab selection must travel continuously while the route updates immediately');
    assert.equal(await page.getByRole('tab', { name: 'Cardio', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Today', exact: true }).click(); await settled(page);

    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await settled(page);
    const handle = page.locator('[data-sheet-handle]');
    let box = await handle.boundingBox();
    const handlePoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await touch('touchStart', handlePoint); await touch('touchMove', { x: handlePoint.x, y: handlePoint.y + 72 });
    const pointer = await appCall(page, app => app._sheetGesture.pointer);
    await handle.evaluate((element, id) => element.releasePointerCapture(id), pointer);
    // Pointer capture transfer is processed before the next actual pointer event.
    await touch('touchMove', { x: handlePoint.x, y: handlePoint.y + 96 });
    await page.waitForFunction(() => window.__interactionApp._sheetGesture === null);
    assert.equal(await appCall(page, app => app._sheetGesture), null, 'Losing capture must cancel the sheet gesture');
    await touch('touchCancel'); await settled(page);
    assert.equal(await page.getByRole('dialog').isVisible(), true, 'Lost capture must leave a usable open sheet');
    assert.equal(await page.locator('.sheet-motion').evaluate(element => getComputedStyle(element).transform), 'none');
    box = await handle.boundingBox();
    await touch('touchStart', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await touch('touchMove', { x: box.x + box.width / 2, y: box.y + box.height / 2 - 90 });
    await touch('touchEnd'); await settled(page);
    assert.equal(await handle.getAttribute('aria-label'), 'Collapse sheet', 'The accessible detent action must follow a drag');
    await page.keyboard.press('Escape'); await settled(page);

    // Essential controls must remain visible and have contrast on the actual surface.
    for (const theme of ['light', 'dark']) {
      if (theme === 'light') await appCall(page, app => { app.state.theme = 'light'; app.go({ editor: { view: 'program' } }); });
      else await appCall(page, app => { app.state.theme = 'dark'; app.go({ editor: { view: 'program' } }); });
      const done = page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true });
      await settled(page);
      const foreground = await done.evaluate(element => getComputedStyle(element).color);
      // A translucent CSS fill is not the rendered background. Measure the
      // composite beside the glyph, including the scene and sheet beneath it.
      const bitmap = PNG.sync.read(await done.screenshot());
      for (const [x, y] of [[.5, .17], [.17, .5], [.83, .5], [.5, .83]]) {
        const offset = (Math.floor(y * bitmap.height) * bitmap.width + Math.floor(x * bitmap.width)) * 4;
        const background = `rgb(${bitmap.data[offset]}, ${bitmap.data[offset + 1]}, ${bitmap.data[offset + 2]})`;
        assert.ok(contrast(foreground, background) >= 3, `${theme}: Done must have 3:1 icon contrast against its rendered material`);
      }
      const shortDay = page.getByRole('dialog').getByRole('button', { name: /^Upper A / }).first();
      const rowGeometry = await shortDay.evaluate(element => ({ width: element.getBoundingClientRect().width, parent: element.parentElement.clientWidth }));
      assert.ok(rowGeometry.width >= rowGeometry.parent - 2, 'Native day buttons must retain the original full-row hit area');
      await done.click(); await settled(page);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await appCall(page, app => { app.go({ modal: { type: 'reference', ex: { ...app.state.program.days[0].exercises[0], name: 'ExtremelyLongUnbrokenCustomExerciseName'.repeat(5) } } }); });
    const close = page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true });
    await settled(page);
    const closeBox = await close.boundingBox();
    assert.ok(closeBox.x >= 0 && closeBox.x + closeBox.width <= 320 && closeBox.width >= 44, 'Long reference names at 200% must retain a visible full-size Close control');
    await close.click(); await settled(page);
    // Exercise titles get a full row; the five actions must never consume their width.
    for (const width of [320, 390]) for (const fontSize of [16, 32]) {
      await page.setViewportSize({ width, height: 844 });
      await page.addStyleTag({ content: `html { font-size:${fontSize}px !important; }` });
      await appCall(page, app => { app.go({ editor: { view: 'day', dayId: app.state.program.days[0].id } }); });
      await settled(page);
      const rows = await page.locator('.editor-row').evaluateAll(rows => rows.map(row => {
        const main = row.querySelector('.editor-exercise-main'), actions = row.querySelector('.editor-actions');
        const container = row.getBoundingClientRect(), name = main.getBoundingClientRect(), toolbar = actions.getBoundingClientRect();
        return { container: container.width, name: name.width, below: toolbar.top >= name.bottom, background: getComputedStyle(main).backgroundColor,
          escaped: name.right > container.right + 1 || toolbar.right > container.right + 1,
          smallActions: [...actions.querySelectorAll('button')].some(button => { const box = button.getBoundingClientRect(); return box.width < 44 || box.height < 44; }) };
      }));
      assert.ok(rows.length > 0);
      for (const row of rows) {
        assert.ok(row.name >= row.container - 30, `${width}/${fontSize}: exercise names must keep the full content width`);
        assert.equal(row.below, true, 'Actions belong below the name');
        assert.equal(row.background, 'rgba(0, 0, 0, 0)', 'The name must not acquire a browser button-face rectangle');
        assert.equal(row.escaped, false); assert.equal(row.smallActions, false);
      }
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: 'html { font-size:32px !important; }' });
    await appCall(page, app => { app.state.program.days[0].name = 'ExtremelyLongUnbrokenCustomDayName'.repeat(5); app.state.program.weekPlan = Array(7).fill(app.state.program.days[0].id); app.go({ editor: { view: 'week' } }); });
    const escapedControls = await page.getByRole('dialog').locator('button').evaluateAll(buttons => buttons.filter(button => { const r = button.getBoundingClientRect(); return r.x < -1 || r.right > innerWidth + 1; }).map(button => button.textContent));
    assert.deepEqual(escapedControls, [], 'Weekly editor controls must remain within the sheet at 200%');
    assert.deepEqual(errors, []);
    process.stdout.write('Presentation gesture, contrast and long-name regressions passed.\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
