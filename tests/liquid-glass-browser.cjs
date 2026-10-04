const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const assetPath = path.join(__dirname, '../app/src/main/assets/Dexter.html');
const evidenceDir = process.env.DEXTER_EVIDENCE_DIR || path.join(os.tmpdir(), 'dexter-liquid-glass-evidence');
const report = { kind: 'desktop Chromium browser evidence', screenshots: [], scenarios: [], performance: [], warnings: [], pending: [
  'Physical Android WebView frame rate, keyboard, system bars/insets, Android Back and native SAF bridge checks',
] };
const WORKOUT_KEY = 'dexter.material.v1';
const PRESENTATION_KEY = 'dexter.presentation.v1';
const tabIDs = { Today: 'today', Cardio: 'conditioning', Progress: 'progress', History: 'history' };

// At least 200 actual date keys exercise History calculations and list rendering.
function populatedStore(theme) {
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dateAgo = days => { const date = new Date(); date.setDate(date.getDate() - days); return key(date); };
  const exercise = (id, name, overrides = {}) => ({ id, name, primary: 'Chest', assist: 'Triceps · Front delt', sets: 3, repLow: 8, repHigh: 12, rir: '1–2', timed: false, disc: false, stretch: false, ref: 'Controlled movement. Keep the complete reference visible, breathe steadily and use a comfortable full range.', ...overrides });
  const bench = exercise('bench', 'Bench press with a controlled pause and full comfortable range', { disc: true, stretch: true });
  const core = exercise('core', 'Dead bug', { primary: 'Core', assist: '—', rir: '—', sets: 2 });
  const timed = exercise('timed', 'Side plank with steady breathing', { primary: 'Core', assist: '—', rir: '—', timed: true, sets: 2, repLow: 20, repHigh: 30 });
  const curl = exercise('curl', 'Dumbbell curls', { primary: 'Biceps', assist: 'Forearms', sets: 2 });
  const days = [
    { id: 'upperA', name: 'Upper A', tag: 'Push', exercises: [bench, core, timed] },
    { id: 'upperB', name: 'Upper B with a deliberately long descriptive session name', tag: 'Pull', exercises: [curl, JSON.parse(JSON.stringify(bench))] },
    { id: 'empty', name: 'Empty day', tag: '', exercises: [] },
  ];
  const logs = {};
  for (let offset = 1; offset <= 200; offset++) {
    const day = days[offset % 2];
    logs[dateAgo(offset)] = { day: day.id, sets: Object.fromEntries(day.exercises.map(ex => [ex.id,
      Array.from({ length: ex.sets }, (_, index) => ({ w: ex.rir === '—' ? 0 : 20 + offset % 8 * 2.5, r: ex.timed ? 25 : 8 + index, done: index < ex.sets - 1, progressVersion: 0 })),
    ])) };
  }
  const customCardioTypes = ['Rowing', 'Swimming', 'Stair climber', 'Outdoor walking with hills and a deliberately long descriptive name', 'Dance', 'Ski erg'].map((name, index) => ({ id: `cardio-fixture-${index}`, name }));
  return {
    program: { weekPlan: Array(7).fill('upperA'), days }, logs, dailyExercises: {}, progressResets: {}, customCardioTypes,
    bodyweight: Array.from({ length: 5 }, (_, index) => ({ date: dateAgo(index + 1), kg: 72.5 + index / 10 })),
    cardio: Array.from({ length: 14 }, (_, index) => ({ date: dateAgo(index + 1), type: index % 2 ? 'cycling' : customCardioTypes[index % customCardioTypes.length].id, min: 10 + index, ts: Date.now() - (index + 1) * 86400000 })),
    phase: { training: 'STANDARD', nutrition: 'CUT', deloadWeeks: 6 }, theme, accentKey: 'violet',
  };
}

async function installFixture(context, store, preferences) {
  await context.addInitScript(({ store, preferences }) => {
    if (!localStorage.getItem('dexter.material.v1')) localStorage.setItem('dexter.material.v1', JSON.stringify(store));
    if (preferences && !localStorage.getItem('dexter.presentation.v1')) localStorage.setItem('dexter.presentation.v1', JSON.stringify(preferences));
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    const probe = window.__presentationProbe = { nativeRAF, nativeCancel, pending, callbacks: 0, longtasks: [], visibility: [], listenerRecords: [] };
    window.requestAnimationFrame = callback => {
      let id;
      id = nativeRAF(time => { pending.delete(id); probe.callbacks++; callback(time); });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); nativeCancel(id); };
    try { new PerformanceObserver(list => probe.longtasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true }); } catch {}
    const callbackIDs = new WeakMap();
    let nextID = 1;
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, callback, options) {
      if (callback && (typeof callback === 'object' || typeof callback === 'function')) {
        if (!callbackIDs.has(callback)) callbackIDs.set(callback, nextID++);
        const id = callbackIDs.get(callback), capture = typeof options === 'boolean' ? options : !!options?.capture;
        if (!probe.listenerRecords.some(record => record.active && record.target.deref() === this && record.type === type && record.id === id && record.capture === capture)) {
          probe.listenerRecords.push({ target: new WeakRef(this), type, id, capture, active: true });
        }
      }
      return originalAdd.call(this, type, callback, options);
    };
    EventTarget.prototype.removeEventListener = function(type, callback, options) {
      const id = callback && callbackIDs.get(callback), capture = typeof options === 'boolean' ? options : !!options?.capture;
      for (const record of probe.listenerRecords) if (record.target.deref() === this && record.type === type && record.id === id && record.capture === capture) record.active = false;
      return originalRemove.call(this, type, callback, options);
    };
    document.addEventListener('visibilitychange', () => probe.visibility.push({ time: performance.now(), state: document.visibilityState }));
  }, { store, preferences });
}

// Access the actual mounted DC logic only for fixture setup and presentation changes
// while an editable field retains focus. User actions below use real DOM controls.
async function appCall(page, action, args) {
  return page.evaluate(({ source, args }) => {
    const node = document.querySelector('.dexter-app');
    if (!node) throw new Error('The mounted Dexter root is missing');
    const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'));
    for (let fiber = key && node[key]; fiber; fiber = fiber.return) {
      if (fiber.stateNode?.logic) return (0, eval)(`(${source})`)(fiber.stateNode.logic, args);
    }
    throw new Error('The real DC logic instance could not be found');
  }, { source: action.toString(), args });
}

async function settle(page) {
  await page.evaluate(async () => {
    for (let pass = 0; pass < 8; pass++) {
      const active = document.getAnimations().filter(animation => animation.playState === 'running');
      if (!active.length) break;
      await Promise.all(active.map(animation => animation.finished.catch(() => {})));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function screenshot(page, name) {
  await settle(page);
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(evidenceDir, filename) });
  report.screenshots.push(filename);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: document overflows the viewport`);
  const duplicateSVGIDs = await page.evaluate(() => {
    const seen = new Set(), repeated = [];
    for (const element of document.querySelectorAll('svg [id]')) { if (seen.has(element.id)) repeated.push(element.id); seen.add(element.id); }
    return repeated;
  });
  assert.deepEqual(duplicateSVGIDs, [], `${name}: concurrently mounted SVG definitions must be unique`);
}

async function tab(page, name) {
  await page.getByRole('tab', { name, exact: true }).click();
  await page.locator(`.screen-scroll[data-screen="${tabIDs[name]}"]`).waitFor();
  assert.equal(await page.getByRole('tab', { name, exact: true }).getAttribute('aria-selected'), 'true', `${name} must become selected immediately`);
}

async function closeSheet(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-background]').evaluate(element => element.inert), false, 'Closing the sheet must release background input');
}

async function settings(page) {
  const opener = page.getByRole('button', { name: 'Settings', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.waitFor();
  return dialog;
}

async function assertModalBehavior(page, opener, name) {
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole('dialog', name ? { name, exact: true } : {});
  await dialog.waitFor();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
  assert.equal(await page.locator('[data-background]').evaluate(element => element.inert), true, 'Background must be inert while a sheet is interactive');
  await dialog.evaluate(element => {
    const focusable = [...element.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')].filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && !node.closest('[inert]'));
    if (!focusable.length) throw new Error('A dialog needs reachable controls');
    window.__dialogFocusEnds = { first: focusable[0], last: focusable.at(-1) };
    focusable.at(-1).focus();
  });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement === window.__dialogFocusEnds.first), true, 'Tab from the final control must wrap to the first');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement === window.__dialogFocusEnds.last), true, 'Shift+Tab from the first control must wrap to the last');
  await closeSheet(page);
  assert.equal(await opener.evaluate(element => element === document.activeElement), true, 'Escape must restore the live opener');
}

async function stableInput(page, input, value) {
  const originalPresentation = await appCall(page, app => ({ theme: app.state.theme, accentKey: app.state.accentKey }));
  await input.fill(value);
  await input.focus();
  const before = await input.evaluate(element => {
    window.__inputUnderTest = element;
    if (['text', 'search', 'tel', 'url', 'password'].includes(element.type) || element.tagName === 'TEXTAREA') element.setSelectionRange(2, Math.min(7, element.value.length));
    return { value: element.value, start: element.selectionStart, end: element.selectionEnd };
  });
  await appCall(page, app => {
    app.state.theme = app.state.theme === 'dark' ? 'light' : 'dark';
    app.state.accentKey = app.state.accentKey === 'teal' ? 'violet' : 'teal';
    app.toast('Input stability check', 'ok');
    app.forceUpdate();
  });
  await settle(page);
  const after = await input.evaluate(element => ({ same: element === window.__inputUnderTest, focused: element === document.activeElement, value: element.value, start: element.selectionStart, end: element.selectionEnd }));
  assert.equal(after.same, true, 'Presentation changes must not remount the active input');
  assert.equal(after.focused, true, 'Presentation changes must not blur an editable field');
  assert.deepEqual({ value: after.value, start: after.start, end: after.end }, before, 'Value and selection must survive theme, accent and toast changes');
  await appCall(page, (app, previous) => { app.state.theme = previous.theme; app.state.accentKey = previous.accentKey; app.forceUpdate(); }, originalPresentation);
}

async function listenerSnapshot(page) {
  return page.evaluate(() => ({
    globalListeners: window.__presentationProbe.listenerRecords.filter(record => record.active && [window, document].includes(record.target.deref())).length,
    filters: document.querySelectorAll('svg filter').length,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    pendingRAF: window.__presentationProbe.pending.size,
  }));
}

async function idleEvidence(page) {
  await settle(page);
  return page.evaluate(async () => {
    const probe = window.__presentationProbe, before = probe.callbacks;
    await new Promise(resolve => { let frames = 0; const sample = () => { if (++frames === 8) resolve(); else probe.nativeRAF(sample); }; probe.nativeRAF(sample); });
    return { appRAFCallbacks: probe.callbacks - before, pendingRAF: probe.pending.size, runningAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length };
  });
}

async function measure(page, name, work) {
  await page.evaluate(() => {
    const probe = window.__presentationProbe;
    const measurement = probe.measurement = { start: performance.now(), frames: [], previous: null, active: true, frameID: null };
    const frame = time => {
      if (!measurement.active) return;
      if (!document.hidden && measurement.previous != null) measurement.frames.push(time - measurement.previous);
      measurement.previous = document.hidden ? null : time;
      measurement.frameID = probe.nativeRAF(frame);
    };
    measurement.frameID = probe.nativeRAF(frame);
  });
  await work();
  await settle(page);
  const data = await page.evaluate(() => {
    const probe = window.__presentationProbe, measurement = probe.measurement;
    measurement.active = false;
    probe.nativeCancel(measurement.frameID);
    return { frames: measurement.frames, elapsed: performance.now() - measurement.start, longtasks: probe.longtasks.filter(task => task.startTime >= measurement.start), visibility: document.visibilityState };
  });
  const sorted = [...data.frames].sort((a, b) => a - b), quantile = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
  report.performance.push({ scenario: name, fixtureHistoryDates: 200, desktopEmulation: true, elapsedMs: data.elapsed, frameCount: data.frames.length, medianFrameMs: quantile(0.5), p95FrameMs: quantile(0.95), maxFrameMs: sorted.at(-1) || null, longtasksOver50Ms: data.longtasks.filter(task => task.duration > 50), frameDeltasMs: data.frames });
}

async function rapidTabs(page) {
  for (const name of ['Cardio', 'History', 'Today', 'Progress', 'History', 'Cardio', 'Today', 'Progress', 'Today']) await tab(page, name);
  assert.equal(await page.getByRole('tab', { name: 'Today', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.screen-scroll').count(), 1, 'Interrupted tab transitions must leave one interactive screen');
}

async function sheetLifecycle(page, theme) {
  await assertModalBehavior(page, page.getByRole('button', { name: 'Settings', exact: true }), 'Settings');
  await settings(page);
  await settle(page);
  const before = await listenerSnapshot(page);
  for (let cycle = 0; cycle < 6; cycle++) { await closeSheet(page); await settings(page); }
  await settle(page);
  const after = await listenerSnapshot(page);
  assert.equal(after.globalListeners, before.globalListeners, 'Repeated sheet refs must not grow window/document subscriptions');
  assert.equal(after.filters, before.filters, 'Repeated sheet presentation must not grow filter nodes');
  assert.equal(after.dialogs, 1, 'Only one dialog may remain interactive');
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  const handle = dialog.locator('[data-sheet-handle]');
  await handle.getAttribute('aria-label').then(label => assert.match(label, /^(Expand|Collapse) sheet$/));
  const box = await handle.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 + 72 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.detach();
  await settle(page);
  assert.equal(await dialog.isVisible(), true, 'pointercancel must settle to a usable sheet');
  await screenshot(page, `${theme}-settings-pointer-cancel`);
  if ((await handle.getAttribute('aria-label')) === 'Expand sheet') await handle.click();
  await screenshot(page, `${theme}-settings-expanded`);
  const scroll = dialog.locator('.sheet-scroll');
  const scrolling = await scroll.evaluate(element => { element.scrollTop = Math.min(160, element.scrollHeight - element.clientHeight); return { top: element.scrollTop, max: element.scrollHeight - element.clientHeight }; });
  if (scrolling.max > 0) assert.ok(scrolling.top > 0, 'Long sheet content must scroll independently');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  for (let cycle = 0; cycle < 3; cycle++) { await settings(page); await closeSheet(page); }
  assert.equal((await idleEvidence(page)).appRAFCallbacks, 0, 'Settled presentation must not own a continuing rAF loop');
}

async function preferences(page, theme) {
  await tab(page, 'Today');
  const previousWorkout = await page.evaluate(() => localStorage.getItem('dexter.material.v1'));
  const dialog = await settings(page);
  for (const name of ['Reduce motion', 'Reduce transparency']) {
    const control = dialog.getByRole('switch', { name, exact: true });
    await control.focus();
    await control.press('Space');
    assert.equal(await control.getAttribute('aria-checked'), 'true', `${name} must support keyboard activation`);
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('dexter.material.v1')), previousWorkout);
  await screenshot(page, `${theme}-settings-reduced-preferences`);
  await closeSheet(page);
  await page.reload();
  const restored = await settings(page);
  for (const name of ['Reduce motion', 'Reduce transparency']) assert.equal(await restored.getByRole('switch', { name, exact: true }).getAttribute('aria-checked'), 'true');
  const glass = await restored.evaluate(element => ({ filter: getComputedStyle(element).backdropFilter, fill: getComputedStyle(element).backgroundColor }));
  assert.equal(glass.filter, 'none', 'Reduce transparency must disable backdrop sampling');
  for (const name of ['Reduce motion', 'Reduce transparency']) await restored.getByRole('switch', { name, exact: true }).click();
  await closeSheet(page);
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-contrast', value: 'more' }] });
  assert.deepEqual(await appCall(page, app => app.effectivePresentation()), { reduceMotion: true, reduceTransparency: true, increaseContrast: true }, 'Local off must still follow all independently exposed OS requests');
  await settings(page);
  await screenshot(page, `${theme}-settings-os-reductions-contrast`);
  await closeSheet(page);
  await tab(page, 'Cardio');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).cardio.length);
  await page.getByPlaceholder('min', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).cardio.length), before + 1, 'Logging must update immediately without animation events');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await cdp.detach();
  await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference' });
  await tab(page, 'Today');
}

async function sessionFlows(page, theme) {
  const originalProgram = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('dexter.material.v1')).program));
  await assertModalBehavior(page, page.getByRole('button', { name: 'Add exercise for today', exact: true }), 'Add exercise');
  await page.getByRole('button', { name: 'Add exercise for today', exact: true }).click();
  await screenshot(page, `${theme}-daily-exercise-picker`);
  await page.getByRole('dialog').getByRole('button', { name: /Dumbbell curls/ }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('dexter.material.v1')).program)), originalProgram);
  await page.getByRole('button', { name: /Start session/ }).click();
  await page.getByRole('button', { name: 'Complete set 1', exact: true }).waitFor();
  await screenshot(page, `${theme}-session-undone`);
  const before = await appCall(page, app => ({ weight: app.state.logs[app.todayKey()].sets.bench[0].w, reps: app.state.logs[app.todayKey()].sets.bench[0].r }));
  const increaseWeight = page.getByRole('button', { name: /Increase.*(?:weight|kg)/i }).first();
  for (let index = 0; index < 3; index++) await increaseWeight.click();
  assert.equal(await appCall(page, app => app.state.logs[app.todayKey()].sets.bench[0].w), before.weight + 7.5, 'Every rapid stepper tap must commit once');
  await page.getByRole('button', { name: 'Complete set 1', exact: true }).click();
  await page.getByRole('button', { name: 'Undo set 1', exact: true }).waitFor();
  const firstCompleted = await appCall(page, app => app.state.logs[app.todayKey()].sets.bench[0]);
  assert.equal(firstCompleted.done, true);
  assert.equal(firstCompleted.r, 8, 'Missing repetitions retain the original lower-limit default');
  await screenshot(page, `${theme}-session-done`);
  await page.getByRole('button', { name: 'Undo set 1', exact: true }).click();
  assert.equal(await appCall(page, app => app.state.logs[app.todayKey()].sets.bench[0].done), false);
  await page.getByRole('button', { name: /(?:Reference|Info)/i }).click();
  await screenshot(page, `${theme}-exercise-reference`);
  await closeSheet(page);
  // The existing 400 ms progression timer is intentional business behavior.
  await appCall(page, app => {
    const rows = app.state.logs[app.todayKey()].sets.bench;
    for (const row of rows) { row.r = 12; row.done = false; }
    app.commit();
  });
  for (const number of [1, 2, 3]) await page.getByRole('button', { name: `Complete set ${number}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sounds good', exact: true }).waitFor();
  const weightBeforeDismissal = await appCall(page, app => app.state.logs[app.todayKey()].sets.bench.map(row => row.w));
  await screenshot(page, `${theme}-progression`);
  await page.getByRole('button', { name: 'Sounds good', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(await appCall(page, app => app.state.logs[app.todayKey()].sets.bench.map(row => row.w)), weightBeforeDismissal);
  await page.getByRole('button', { name: 'Next exercise', exact: true }).click();
  await screenshot(page, `${theme}-session-core`);
  await page.getByRole('button', { name: 'Complete set 1', exact: true }).click();
  assert.equal(await appCall(page, app => app.state.logs[app.todayKey()].sets.core[0].w), 0);
  await appCall(page, app => app.toast('Exercise change during toast', 'ok'));
  await page.getByRole('button', { name: 'Next exercise', exact: true }).click();
  await screenshot(page, `${theme}-session-timed`);
  await page.getByRole('button', { name: 'Complete set 1', exact: true }).click();
  assert.equal(await appCall(page, app => app.state.logs[app.todayKey()].sets.timed[0].r), 25, 'Timed sets retain the previous-session repetitions when the current row is empty');
  await page.getByRole('button', { name: 'Add exercise for today', exact: true }).click();
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /Dumbbell curls/ }).count(), 0, 'Already-added daily IDs must stay excluded in-session');
  await closeSheet(page);
  await page.getByRole('button', { name: 'Next exercise', exact: true }).click();
  await page.getByRole('button', { name: 'Finish session', exact: true }).click();
  await page.getByRole('tab', { name: 'Today', exact: true }).waitFor();
}

async function editorFlows(page, theme) {
  await settings(page);
  await page.getByRole('button', { name: /Edit program/ }).click();
  assert.equal(await page.getByRole('dialog').count(), 1, 'Settings-to-Editor handoff must have one interactive dialog');
  await screenshot(page, `${theme}-editor-program`);
  await page.getByRole('dialog').getByRole('button', { name: /Upper A/ }).click();
  await screenshot(page, `${theme}-editor-day`);
  await stableInput(page, page.getByPlaceholder('Day name', { exact: true }), 'Upper A');
  await stableInput(page, page.getByPlaceholder('Tag (e.g. Quad-biased)', { exact: true }), 'Push');
  assert.equal(await page.getByRole('button', { name: /^Move up/ }).first().isDisabled(), true);
  await page.getByRole('button', { name: /^Copy exercise/ }).first().click();
  await screenshot(page, `${theme}-editor-copy`);
  const currentCopy = page.getByRole('dialog').getByRole('button', { name: /Upper A.*current/ });
  assert.equal(await currentCopy.isDisabled(), true, 'Copy to current day must remain disabled');
  const alreadyCopy = page.getByRole('dialog').getByRole('button', { name: /Upper B.*already added/ });
  assert.equal(await alreadyCopy.isDisabled(), true, 'Copy to a day containing the same ID must remain disabled');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /^Move exercise/ }).first().click();
  await screenshot(page, `${theme}-editor-move`);
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /Upper A.*current/ }).isDisabled(), true);
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /Upper B.*already added/ }).isDisabled(), true);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Bench press with a controlled pause/ }).click();
  await screenshot(page, `${theme}-editor-exercise`);
  for (const [placeholder, value] of [['Name', 'Bench press with a controlled pause and full comfortable range'], ['Primary', 'Chest'], ['Assist', 'Triceps · Front delt']]) await stableInput(page, page.getByPlaceholder(placeholder, { exact: true }), value);
  await stableInput(page, page.getByRole('dialog').locator('textarea'), 'Keep the complete cue, selection and cursor stable through every presentation update.');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Add exercise/, exact: true }).click();
  await screenshot(page, `${theme}-editor-addex`);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Weekly plan/ }).click();
  await screenshot(page, `${theme}-editor-week`);
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/ }).count(), 7);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Add a day/, exact: true }).click();
  await screenshot(page, `${theme}-editor-newday`);
  await stableInput(page, page.getByPlaceholder('Day name (e.g. Arms & Delts)', { exact: true }), 'Arms & Delts');
  await stableInput(page, page.getByPlaceholder('Tag (optional)', { exact: true }), 'Accessory');
  await closeSheet(page);
}

async function cardioAndInputs(page, theme) {
  await tab(page, 'Cardio');
  await stableInput(page, page.getByPlaceholder('min', { exact: true }), '18');
  await page.getByRole('button', { name: 'Add cardio exercise', exact: true }).click();
  await screenshot(page, `${theme}-custom-cardio-sheet`);
  await stableInput(page, page.getByRole('textbox', { name: 'Cardio exercise name', exact: true }), '  Hiking  ');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const custom = await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).customCardioTypes.at(-1));
  assert.equal(custom.name, 'Hiking');
  await page.getByRole('button', { name: 'Add cardio exercise', exact: true }).click();
  await page.getByRole('textbox', { name: 'Cardio exercise name', exact: true }).fill('hiking');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByText('That cardio exercise already exists', { exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  await closeSheet(page);
  await page.getByPlaceholder('min', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByText('Enter minutes', { exact: true }).waitFor();
  await page.getByPlaceholder('min', { exact: true }).fill('18');
  const beforeLog = await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).cardio.length);
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).cardio.length), beforeLog + 1);
  await screenshot(page, `${theme}-cardio-many-types`);
  await tab(page, 'Progress');
  await stableInput(page, page.getByPlaceholder('kg', { exact: true }), '72.6');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Weight saved', { exact: true }).waitFor();
  await screenshot(page, `${theme}-progress-bodyweight`);
  await page.getByRole('button', { name: /(?:Choose|Select) exercise|Bench press with a controlled pause|Dumbbell curls/ }).first().click();
  await screenshot(page, `${theme}-exercise-picker`);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const checkboxes = page.getByRole('checkbox');
  await checkboxes.nth(0).click();
  await checkboxes.nth(1).click();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).logs);
  await screenshot(page, `${theme}-progress-multi-reset`);
  await page.getByRole('button', { name: /Delete progress \(2\)/ }).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).logs), history);
  await closeSheet(page);
}

async function historyScroll(page, theme) {
  await tab(page, 'History');
  const screen = page.locator('.screen-scroll[data-screen="history"]');
  assert.ok(await screen.getByRole('button').count() >= 200, 'History must render the actual 200-date fixture');
  await screenshot(page, `${theme}-history-200-dates`);
  await screen.evaluate(element => { element.scrollTop = 1400; });
  const position = await screen.evaluate(element => element.scrollTop);
  assert.ok(position >= 1000);
  await tab(page, 'Cardio');
  await tab(page, 'History');
  await page.waitForFunction(position => Math.abs(document.querySelector('.screen-scroll[data-screen="history"]').scrollTop - position) < 3, position);
  assert.ok(Math.abs(await page.locator('.screen-scroll[data-screen="history"]').evaluate(element => element.scrollTop) - position) < 3, 'Each tab must restore its previous scroll position');
  await page.locator('.screen-scroll[data-screen="history"]').evaluate(element => { element.scrollTop = 0; });
  await page.locator('.screen-scroll[data-screen="history"]').getByRole('button').first().click();
  await screenshot(page, `${theme}-history-detail`);
  await closeSheet(page);
}

async function backups(page, theme) {
  await tab(page, 'Today');
  await settings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export backup/ }).click();
  const download = await downloadPromise;
  const downloadedPath = path.join(evidenceDir, `${theme}-browser-backup.json`);
  await download.saveAs(downloadedPath);
  const exported = JSON.parse(fs.readFileSync(downloadedPath, 'utf8'));
  assert.equal(exported.version, 3);
  assert.equal('reduceMotion' in exported, false);
  assert.equal('presentation' in exported, false);
  await page.getByRole('button', { name: /Restore backup/ }).click();
  await screenshot(page, `${theme}-restore`);
  const paste = page.getByPlaceholder('…or paste backup JSON here', { exact: true });
  await stableInput(page, paste, JSON.stringify(exported));
  await page.getByRole('button', { name: 'Restore from pasted text', exact: true }).click();
  await page.getByText('Backup restored', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).logs), exported.logs);
  await settings(page);
  await page.getByRole('button', { name: /Restore backup/ }).click();
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({ name: 'legacy-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 2, logs: exported.logs })) });
  await page.getByText('Backup restored', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).logs), exported.logs);
  await page.evaluate(() => { window.Android = { exportFile(name, json) { window.__bridgeExport = { name, data: JSON.parse(json) }; } }; });
  await settings(page);
  await page.getByRole('button', { name: /Export backup/ }).click();
  assert.equal(await page.evaluate(() => window.__bridgeExport.data.version), 3);
  await page.evaluate(() => window._exportCb(false));
  await page.getByText('Export cancelled', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => typeof window._exportCb), 'undefined');
  await page.getByRole('button', { name: /Export backup/ }).click();
  await page.evaluate(() => window._exportCb(true));
  await page.getByText('Backup saved', { exact: true }).waitFor();
  await closeSheet(page);
  await page.evaluate(() => { delete window.Android; });
  report.scenarios.push(`${theme}: browser download/file/paste backups and simulated native export success/cancellation`);
}

async function visualMatrix(page, theme) {
  await appCall(page, (app, theme) => { app.state.theme = theme; app.state.accentKey = 'violet'; app.forceUpdate(); }, theme);
  for (const width of [320, 360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const scale of [100, 130, 200]) {
      await page.addStyleTag({ content: `html { font-size: ${16 * scale / 100}px !important; }` });
      for (const name of Object.keys(tabIDs)) {
        await tab(page, name);
        await screenshot(page, `${theme}-${name.toLowerCase()}-${width}-${scale}`);
        const targetViolations = await page.getByRole('tab').evaluateAll(elements => elements.filter(element => { const box = element.getBoundingClientRect(); return box.width < 44 || box.height < 44; }).map(element => element.textContent.trim()));
        assert.deepEqual(targetViolations, [], `${width}/${scale}: every navigation tab needs a 44px target`);
      }
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addStyleTag({ content: 'html { font-size: 16px !important; }' });
  await tab(page, 'Today');
  await screenshot(page, `${theme}-landscape`);
  await settings(page);
  await screenshot(page, `${theme}-landscape-settings`);
  await closeSheet(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const accent of ['violet', 'teal', 'coral', 'amber', 'pink', 'blue']) {
    const dialog = await settings(page);
    await dialog.getByRole('button', { name: new RegExp(`^(?:${accent}|.*${accent}.*accent.*|.*accent.*${accent}.*)$`, 'i') }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')).accentKey), accent);
    await screenshot(page, `${theme}-settings-accent-${accent}`);
    await closeSheet(page);
    await screenshot(page, `${theme}-today-accent-${accent}`);
  }
}

async function emptyAndRest(page, theme) {
  await appCall(page, app => { app.state.program.weekPlan = Array(7).fill('rest'); app.go({ tab: 'today' }); });
  await screenshot(page, `${theme}-today-rest`);
  await page.getByRole('button', { name: /Train anyway/ }).click();
  await screenshot(page, `${theme}-pick-session`);
  await page.getByRole('dialog').getByRole('button', { name: /Empty day/ }).click();
  await screenshot(page, `${theme}-session-empty-day`);
  await page.getByRole('tab', { name: 'Today', exact: true }).waitFor();
  assert.equal(await appCall(page, app => app.state.inSession), false, 'The existing empty-day behavior exits the session automatically');
  await appCall(page, app => { app.state.logs = {}; app.state.cardio = []; app.state.bodyweight = []; app.state.dailyExercises = {}; app.state.progPick = null; app.forceUpdate(); });
  for (const name of ['Cardio', 'Progress', 'History']) { await tab(page, name); await screenshot(page, `${theme}-${name.toLowerCase()}-empty`); }
}

async function saveChromiumTrace(cdp, destination) {
  const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await completed;
  const parts = [];
  for (;;) { const chunk = await cdp.send('IO.read', { handle: stream }); parts.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8')); if (chunk.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  fs.writeFileSync(destination, Buffer.concat(parts));
}

async function offlineColdLoad(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, offline: true });
  const requests = [];
  const page = await context.newPage();
  page.on('request', request => requests.push({ url: request.url(), type: request.resourceType() }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let origin = 'file://';
  try {
    await page.goto(pathToFileURL(assetPath).href, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    if (!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
    origin = 'memory-fulfilled HTTP navigation with network disabled';
    report.pending.push('Actual file:// cold-load: this managed Chromium policy rejects file navigation with ERR_BLOCKED_BY_ADMINISTRATOR');
    report.warnings.push('Offline verification loaded the unchanged packaged bytes through a memory-fulfilled navigation. It does not certify Android file-origin behavior.');
    await page.route('http://dexter-offline.invalid/**', route => {
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType:'text/html', body:fs.readFileSync(assetPath,'utf8') });
      return route.abort();
    });
    await page.goto('http://dexter-offline.invalid/', { waitUntil:'domcontentloaded' });
  }
  await page.getByRole('tab', { name: 'Today', exact: true }).waitFor();
  await screenshot(page, 'offline-file-cold-load');
  for (const name of Object.keys(tabIDs)) await tab(page, name);
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].map(font => ({ family: font.family, status: font.status })); });
  assert.ok(fonts.some(font => /Inter/i.test(font.family) && font.status === 'loaded'), 'The actual offline fallback font must load');
  assert.deepEqual(requests.filter(request => /^https?:/.test(request.url) && !request.url.startsWith('http://dexter-offline.invalid/')), [], 'Cold offline load must operate with no remote runtime/font/icon requests');
  assert.deepEqual(errors, []);
  report.offline = { origin, network: 'disabled', requests, fonts, errors };
  await context.close();
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const html = fs.readFileSync(assetPath);
  const server = http.createServer((request, response) => {
    // Match Android's optional self-fetch failure without altering the app.
    if (request.headers['sec-fetch-dest'] !== 'document') { response.statusCode = 404; response.end(); return; }
    response.setHeader('Content-Type', 'text/html'); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.DEXTER_CHROMIUM_PATH ? { executablePath: process.env.DEXTER_CHROMIUM_PATH } : {}), headless: true, args: ['--no-sandbox'] });
    report.browser = { version: browser.version(), host: { platform: os.platform(), architecture: os.arch(), release: os.release() }, viewport: 'CSS emulation; 390x844 for recordings', deviceScaleFactor: 1, assetBytes: html.length };
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, recordVideo: { dir: path.join(evidenceDir, 'videos'), size: { width: 390, height: 844 } } });
      await installFixture(context, populatedStore(theme));
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: 'Today', exact: true }).waitFor();
      await screenshot(page, `${theme}-today-initial`);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,cc,gpu,disabled-by-default-devtools.timeline.frame', transferMode: 'ReturnAsStream' });
      await measure(page, `${theme}: rapid tabs`, () => rapidTabs(page));
      await measure(page, `${theme}: sheet open/close/drag cancellation`, () => sheetLifecycle(page, theme));
      await measure(page, `${theme}: weighted/core/timed session logging`, () => sessionFlows(page, theme));
      await measure(page, `${theme}: History scroll with 200 dates`, () => historyScroll(page, theme));
      await saveChromiumTrace(cdp, path.join(evidenceDir, `${theme}-chromium-trace.json`));
      await cdp.detach();
      await tab(page, 'Today');
      await editorFlows(page, theme);
      await cardioAndInputs(page, theme);
      await preferences(page, theme);
      await backups(page, theme);
      await visualMatrix(page, theme);
      await emptyAndRest(page, theme);
      const idle = await idleEvidence(page);
      assert.equal(idle.appRAFCallbacks, 0);
      assert.equal(idle.pendingRAF, 0);
      assert.equal(idle.runningAnimations, 0);
      assert.deepEqual(errors, [], `${theme}: unexpected browser exceptions`);
      report.scenarios.push(`${theme}: all four populated/empty tabs, training/rest, weighted/core/timed/empty sessions, all eight editor views, all sheets, input selection preservation, focus trap/restoration, pointercancel, OS/local reductions, six accents and width/text-scale matrix`);
      report[`${theme}Idle`] = idle;
      await context.tracing.stop({ path: path.join(evidenceDir, `${theme}-playwright-trace.zip`) });
      const video = page.video();
      await context.close();
      if (video) {
        const fullVideo = path.join(evidenceDir, `${theme}-interactions.webm`);
        await video.saveAs(fullVideo);
        try {
          execFileSync(process.env.DEXTER_FFMPEG_PATH || 'ffmpeg', ['-y', '-i', fullVideo, '-t', '30', '-c', 'copy', path.join(evidenceDir, `${theme}-interaction-excerpt.webm`)], { stdio: 'ignore' });
        } catch {
          report.warnings.push(`${theme}: short video excerpt could not be generated; full interaction recording is available. Set DEXTER_FFMPEG_PATH to a compatible ffmpeg binary.`);
        }
      }
    }
    await offlineColdLoad(browser);
    report.result = 'passed';
    process.stdout.write(`Liquid Glass browser checks passed. Evidence: ${evidenceDir}\n`);
  } catch (error) {
    report.result = 'failed'; report.failure = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
