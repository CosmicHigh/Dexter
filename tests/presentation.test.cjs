const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/Dexter.html'), 'utf8');
const runtimeScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(source => /^\/\* (?:React(?:DOM)? 18\.3\.1|Dexter DC runtime)/.test(source));
const componentMatch = html.match(/^<script\b[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/m);
assert.ok(componentMatch, 'The actual DC component script must remain available');
const appSource = componentMatch[1];
const WORKOUT_KEY = 'dexter.material.v1';
const PRESENTATION_KEY = 'dexter.presentation.v1';

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

// Exercise the real class in the same dependency-free environment as the workout tests.
// Storage and media APIs are the browser boundary, not replacements for app behavior.
function fixture({ presentation, media = {}, failRead = false, failWrite = false } = {}) {
  const storage = new Map();
  const accesses = [];
  if (presentation !== undefined) storage.set(PRESENTATION_KEY, presentation);
  const matchMedia = query => ({
    matches: !!media[query], media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  const context = vm.createContext({
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ['2026-10-04T12:00:00Z'])); }
      static now() { return Date.parse('2026-10-04T12:00:00Z'); }
    },
    localStorage: {
      getItem(key) {
        accesses.push({ type: 'read', key });
        if (failRead && key === PRESENTATION_KEY) throw new Error('Storage read blocked');
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        accesses.push({ type: 'write', key });
        if (failWrite && key === PRESENTATION_KEY) throw new Error('Storage write blocked');
        storage.set(key, value);
      },
    },
    DCLogic: class { constructor(props) { this.props = props; } forceUpdate() {} },
    setTimeout() {}, clearTimeout() {},
    matchMedia,
    window: { matchMedia, Android: { exportFile: (name, json) => { context.backup = JSON.parse(json); } } },
  });
  context.self = context;
  vm.runInContext(runtimeScripts[0], context);
  vm.runInContext(appSource + '\nthis.App = Component;', context);
  const app = new context.App({});
  app.todayKey = () => '2026-10-04';
  app.todayDayId = () => 'upperA';
  return { app, context, storage, accesses, media };
}

test('the three offline React, ReactDOM and DC runtime blocks remain verbatim', () => {
  // SHA-256 of structurally extracted script bodies at 3d8b0437445f5d7977edf2c1261cdaee45b61f3c.
  // A presentation rebuild must not silently fork the vendored execution environment.
  const expected = [
    'a0f743391a81d76b1fae6f18673cc306fb3992b2f845326823b3cc70f6cc4479',
    'b9ea514afc2fb63e01f4820836b19d8aa57e0d1659fbd0bc407d87669856a273',
    'd50ca384418a950f72fdbbf06465b7abb65b88c2e545792912522dd5f33d0b3a',
  ];
  assert.deepEqual(runtimeScripts.map(source => crypto.createHash('sha256').update(source).digest('hex')), expected);
  assert.match(html, /\{\{ app \}\}/, 'DC must still bind the rendered app');
  assert.match(appSource, /\/\* __END__ \*\/\s*}\s*$/, 'The component boundary marker must remain intact');
});

test('presentation preferences default to false in their own store', () => {
  const { app, storage } = fixture();
  assert.equal(typeof app.loadPresentation, 'function', 'A presentation-only preference loader is required');
  assert.deepEqual(plain(app.loadPresentation()), { reduceMotion: false, reduceTransparency: false });
  assert.equal(storage.has(WORKOUT_KEY), false, 'Reading preferences must not create workout data');
});

test('malformed presentation values fall back to safe boolean defaults', () => {
  for (const raw of ['{', 'null', '[]', '42', '"disabled"']) {
    const { app } = fixture({ presentation: raw });
    assert.equal(typeof app.loadPresentation, 'function');
    assert.deepEqual(plain(app.loadPresentation()), { reduceMotion: false, reduceTransparency: false }, raw);
  }
  const { app } = fixture({ presentation: JSON.stringify({ reduceMotion: 'false', reduceTransparency: true, logs: { injected: true } }) });
  assert.deepEqual(plain(app.loadPresentation()), { reduceMotion: false, reduceTransparency: true });
});

test('unavailable preference storage does not stop app boot or OS reductions', () => {
  const { app } = fixture({ failRead: true, media: { '(prefers-reduced-motion: reduce)': true } });
  assert.equal(typeof app.loadPresentation, 'function');
  assert.deepEqual(plain(app.loadPresentation()), { reduceMotion: false, reduceTransparency: false });
  assert.equal(typeof app.effectivePresentation, 'function');
  assert.equal(app.effectivePresentation().reduceMotion, true);
  assert.ok(app.state.program.days.length > 0, 'Workout boot must survive the independent preference error');
});

test('effective reductions combine local and OS requests and track contrast independently', () => {
  const f = fixture();
  assert.equal(typeof f.app.effectivePresentation, 'function');
  assert.equal(typeof f.app.setPresentation, 'function');
  assert.deepEqual(plain(f.app.effectivePresentation()), { reduceMotion: false, reduceTransparency: false, increaseContrast: false });
  f.app.setPresentation('reduceMotion', true);
  assert.equal(f.app.effectivePresentation().reduceMotion, true);
  assert.equal(f.app.effectivePresentation().reduceTransparency, false);
  f.app.setPresentation('reduceMotion', false);
  f.media['(prefers-reduced-motion: reduce)'] = true;
  f.media['(prefers-reduced-transparency: reduce)'] = true;
  f.media['(prefers-contrast: more)'] = true;
  f.app.setPresentation('reduceTransparency', false);
  assert.deepEqual(plain(f.app.effectivePresentation()), { reduceMotion: true, reduceTransparency: true, increaseContrast: true });
  f.media['(prefers-contrast: more)'] = false;
  assert.equal(f.app.effectivePresentation().increaseContrast, false);
});

test('preference changes persist separately and leave workout saves and backups unchanged', () => {
  const { app, context, storage, accesses } = fixture();
  app.addDailyExercise('upperA', 'hammer-curl');
  app.state.logs['2026-10-03'] = { day: 'upperB', sets: { 'hammer-curl': [{ w: 20, r: 10, done: true, progressVersion: 0 }] } };
  app.commit();
  app.exportBackup();
  const previousWorkout = storage.get(WORKOUT_KEY);
  const previousBackup = plain(context.backup);
  accesses.length = 0;
  assert.equal(typeof app.setPresentation, 'function');
  app.setPresentation('reduceMotion', true);
  app.setPresentation('reduceTransparency', true);
  assert.deepEqual(JSON.parse(storage.get(PRESENTATION_KEY)), { reduceMotion: true, reduceTransparency: true });
  assert.equal(storage.get(WORKOUT_KEY), previousWorkout);
  assert.ok(accesses.filter(access => access.type === 'write').every(access => access.key === PRESENTATION_KEY));
  app.exportBackup();
  assert.deepEqual(plain(context.backup), previousBackup, 'Version-3 workout exports must not acquire presentation fields');
  const restored = fixture({ presentation: storage.get(PRESENTATION_KEY) });
  assert.deepEqual(plain(restored.app.loadPresentation()), { reduceMotion: true, reduceTransparency: true });
  app.importBackup(JSON.stringify({ version: 2, logs: {} }));
  assert.equal(storage.get(PRESENTATION_KEY), JSON.stringify({ reduceMotion: true, reduceTransparency: true }), 'Workout restore must not reset presentation choices');
});

test('a failed preference write retains a usable in-memory reduction', () => {
  const { app, storage } = fixture({ failWrite: true });
  assert.equal(typeof app.setPresentation, 'function');
  assert.doesNotThrow(() => app.setPresentation('reduceMotion', true));
  assert.equal(app.effectivePresentation().reduceMotion, true);
  assert.equal(storage.has(PRESENTATION_KEY), false);
  app.startSession('upperA');
  assert.equal(app.state.inSession, true, 'Logging must still work after storage rejects a presentation write');
});

test('the actual Settings switches route to the independent preference store', () => {
  const { app, storage } = fixture();
  app.go({ settings: true });
  for (const [label, key] of [['Reduce motion', 'reduceMotion'], ['Reduce transparency', 'reduceTransparency']]) {
    const findSwitch = () => nodes(app.settingsSheet()).find(node => node.props?.role === 'switch' && node.props?.['aria-label'] === label);
    const control = findSwitch();
    assert.ok(control, `Settings needs a named ${label} switch`);
    assert.equal(control.type, 'button', `${label} must support keyboard activation through a real button`);
    assert.equal(control.props['aria-checked'], false);
    control.props.onClick();
    assert.equal(findSwitch().props['aria-checked'], true);
    assert.equal(JSON.parse(storage.get(PRESENTATION_KEY))[key], true);
  }
  assert.equal(storage.has(WORKOUT_KEY), false, 'Accessibility-only changes must not save a new workout profile');
});

test('accessible tab controls update the existing route immediately through rapid selections', () => {
  const { app } = fixture();
  const labels = ['Today', 'Cardio', 'Progress', 'History'];
  const ids = ['today', 'conditioning', 'progress', 'history'];
  const controls = () => nodes(app.navBar()).filter(node => node.props?.role === 'tab');
  assert.equal(controls().length, 4, 'The four routes must be exposed as selected tabs');
  assert.ok(controls().every(node => node.type === 'button'), 'Each tab needs native keyboard/button activation');
  for (const index of [1, 3, 0, 2, 3, 1, 0]) {
    controls()[index].props.onClick();
    assert.equal(app.state.tab, ids[index], `${labels[index]} navigation must not wait for a transition`);
    assert.deepEqual(controls().map(node => node.props['aria-selected']), ids.map(id => id === app.state.tab));
  }
});

test('stepper buttons commit every tap immediately and preserve the existing numeric rules', () => {
  const { app } = fixture();
  let value = 0, calls = 0;
  function tap(kind, step = 2.5) {
    const control = nodes(app.stepper(value, step, '', next => { value = next; calls++; }, 'weight')).find(node => node.type === 'button' && new RegExp(`^${kind}`, 'i').test(node.props?.['aria-label'] || ''));
    assert.ok(control, `A real named ${kind} stepper button is required`);
    control.props.onClick();
  }
  tap('Increase'); tap('Increase'); tap('Increase');
  assert.equal(value, 7.5);
  assert.equal(calls, 3);
  tap('Decrease'); tap('Decrease'); tap('Decrease'); tap('Decrease');
  assert.equal(value, 0, 'Weight cannot fall below zero');
  tap('Increase', 1);
  assert.equal(value, 1, 'Repetitions retain their one-unit step');
  value = 0;
  tap('Increase', 5);
  assert.equal(value, 5, 'Timed exercises retain their five-second step');
});

test('complete and undo buttons route to the live workout row without animation delays', () => {
  const { app, storage } = fixture();
  app.startSession('upperA');
  const exercise = app.workoutDay('upperA').exercises[0];
  const complete = nodes(app.sessionView()).find(node => node.type === 'button' && node.props?.['aria-label'] === 'Complete set 1');
  assert.ok(complete, 'A named completion button must operate the first set');
  complete.props.onClick();
  let row = app.state.logs[app.todayKey()].sets[exercise.id][0];
  assert.equal(row.done, true);
  assert.equal(row.r, exercise.repLow);
  assert.equal(row.progressVersion, 0);
  assert.equal(JSON.parse(storage.get(WORKOUT_KEY)).logs[app.todayKey()].sets[exercise.id][0].done, true, 'The set must save before any presentation effect finishes');
  const undo = nodes(app.sessionView()).find(node => node.type === 'button' && node.props?.['aria-label'] === 'Undo set 1');
  assert.ok(undo, 'Completion must expose a named undo action');
  undo.props.onClick();
  row = app.state.logs[app.todayKey()].sets[exercise.id][0];
  assert.equal(row.done, false);
  assert.equal(row.r, exercise.repLow, 'Undo retains the existing repetition value');
});
