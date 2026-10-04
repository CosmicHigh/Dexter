const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/Dexter.html'), 'utf8');
const reactSource = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const appSource = html.slice(html.lastIndexOf('class Component extends DCLogic')).match(/class Component extends DCLogic[\s\S]*?\/\* __END__ \*\/\s*}/)[0];

function fixture(saved) {
  const storage = new Map(saved ? [['dexter.material.v1', JSON.stringify(saved)]] : []);
  const context = vm.createContext({
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-04T12:00:00Z'])); } static now() { return Date.parse('2026-10-04T12:00:00Z'); } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    DCLogic: class { constructor(props) { this.props = props; } forceUpdate() {} },
    // Suppress toast/animation timers; assertions invoke the real app methods and React event handlers.
    setTimeout() {},
    window: { Android: { exportFile: (name, json) => { context.backup = JSON.parse(json); } } },
  });
  context.self = context;
  vm.runInContext(reactSource, context);
  vm.runInContext(appSource + '\nthis.App = Component;', context);
  const app = new context.App({});
  let date = '2026-10-04';
  app.todayKey = () => date;
  app.todayDayId = () => 'upperA';
  return { app, context, storage, setDate: value => { date = value; }, reload: () => fixture(JSON.parse(storage.get(app.LSKEY))) };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return text(tree.props?.children);
}
function action(tree, label) {
  const node = nodes(tree).find(node => node.props?.onClick && text(node) === label);
  assert.ok(node, `Expected a clickable "${label}" control`);
  return node;
}
function logged(app, date, exId, weight = 20, reps = 10) {
  app.state.logs[date] = { day: 'upperB', sets: { [exId]: [{ w: weight, r: reps, done: true }] } };
}

test('existing exercise copies retain one progress series across workout days', () => {
  const { app } = fixture();
  const ex = app.dayById('upperB').exercises.find(x => x.id === 'hammer-curl');
  app.dayById('upperA').exercises.push(app.deepCopy(ex));
  logged(app, '2026-10-02', ex.id);
  logged(app, '2026-10-03', ex.id, 25);
  assert.equal(app.allLoggedExercises().filter(x => x.id === ex.id).length, 1);
  assert.equal(app.seriesFor(ex.id).length, 2);
});

test('Today opens a picker of active exercises not already in this workout', () => {
  const { app } = fixture();
  action(app.screenToday(), 'addAdd').props.onClick();
  assert.equal(app.state.todayPickDay, 'upperA');
  app.dayById('lowerA').exercises.push(app.deepCopy(app.dayById('upperB').exercises.find(x => x.id === 'hammer-curl')));
  app.dayById('upperB').exercises = app.dayById('upperB').exercises.filter(x => x.id !== 'incline-curl');
  const names = nodes(app.todayExerciseSheet()).filter(n => n.props?.onClick).map(text);
  assert.equal(names.filter(n => n.includes('Hammer Curl')).length, 1);
  assert.ok(!names.some(n => n.includes('Incline DB Curl')));
  assert.ok(!names.some(n => n.includes('Incline DB Press')));
});

test('day-only additions survive reopening without changing the saved routine or duplicating IDs', () => {
  const f = fixture(), { app } = f;
  const original = JSON.stringify(app.state.program);
  assert.equal(typeof app.addDailyExercise, 'function', 'day-only additions must be supported');
  assert.equal(app.addDailyExercise('upperA', 'hammer-curl'), true);
  assert.equal(app.addDailyExercise('upperA', 'hammer-curl'), false);
  assert.equal(app.addDailyExercise('upperA', 'incline-db'), false);
  assert.equal(app.addDailyExercise('upperA', 'deleted-id'), false);
  assert.equal(JSON.stringify(app.state.program), original);
  assert.equal(app.workoutDay('upperA').exercises.filter(x => x.id === 'hammer-curl').length, 1);
  assert.equal(f.reload().app.workoutDay('upperA').exercises.at(-1).id, 'hammer-curl');
  f.setDate('2026-10-05');
  assert.ok(!app.workoutDay('upperA').exercises.some(x => x.id === 'hammer-curl'));
});

test('an added exercise uses existing weights, logs, progress and History metadata', () => {
  const { app } = fixture();
  const custom = app.newExercise('Tempo curl with pause', 'Biceps', 'Forearms');
  custom.timed = true;
  app.dayById('upperB').exercises.push(custom);
  logged(app, '2026-10-03', custom.id, 17.5, 12);
  assert.equal(typeof app.addDailyExercise, 'function');
  app.addDailyExercise('upperA', custom.id);
  app.startSession('upperA');
  app.state.curEx = app.workoutDay('upperA').exercises.findIndex(x => x.id === custom.id);
  assert.ok(text(app.sessionView()).includes(custom.name));
  action(app.sessionView(), 'check').props.onClick();
  assert.equal(app.state.logs[app.todayKey()].sets[custom.id][0].w, 17.5);
  assert.equal(app.lastTwoFor(custom.id).length, 2);
  assert.equal(app.allLoggedExercises().filter(x => x.id === custom.id).length, 1);
  assert.equal(app.daySummary(app.todayKey()).totalPlanned, app.dayById('upperA').exercises.length + 1);
  app.state.dayDetail = app.todayKey();
  assert.ok(text(app.dayDetailSheet()).includes(custom.name));
  app.dayById('upperB').exercises.pop();
  assert.ok(text(app.dayDetailSheet()).includes(custom.name));
});

test('an active session on a rest day offers Add without changing the weekly plan', () => {
  const { app } = fixture();
  const week = JSON.stringify(app.state.program.weekPlan);
  app.todayDayId = () => 'rest';
  app.startSession('upperA');
  action(app.sessionView(), 'addAdd').props.onClick();
  assert.equal(app.state.todayPickDay, 'upperA');
  assert.equal(JSON.stringify(app.state.program.weekPlan), week);
});

test('progress deletion resets selected exercises while preserving every History log and workout total', () => {
  const f = fixture(), { app } = f;
  logged(app, '2026-10-02', 'hammer-curl');
  logged(app, '2026-10-03', 'incline-curl');
  app.state.logs['2026-10-03'].sets.pullup = [{ w: 30, r: 8, done: true }];
  const history = JSON.stringify(app.state.logs);
  const dates = plain(app.loggedDates());
  assert.equal(typeof app.resetExerciseProgress, 'function', 'progress resets must be independent of History');
  app.resetExerciseProgress(['hammer-curl', 'incline-curl']);
  assert.equal(JSON.stringify(app.state.logs), history);
  assert.deepEqual(plain(app.loggedDates()), dates);
  assert.equal(app.workoutsInLast(30), 2);
  assert.equal(app.seriesFor('hammer-curl').length, 0);
  assert.equal(app.lastTwoFor('incline-curl').length, 0);
  assert.deepEqual(plain(app.allLoggedExercises().map(x => x.id)), ['pullup']);
  assert.equal(app.lastRowsFor('hammer-curl')[0].w, 20, 'workout suggestions still use History');
  const restored = f.reload().app;
  assert.equal(JSON.stringify(restored.state.logs), history);
  assert.equal(restored.seriesFor('hammer-curl').length, 0);
});

test('newly logged sets start fresh progress after a reset, including on the same day', () => {
  const { app } = fixture();
  app.startSession('upperB');
  app.state.curEx = app.dayById('upperB').exercises.findIndex(x => x.id === 'hammer-curl');
  action(app.sessionView(), 'check').props.onClick();
  assert.equal(typeof app.resetExerciseProgress, 'function');
  app.resetExerciseProgress(['hammer-curl']);
  assert.equal(app.lastTwoFor('hammer-curl').length, 0);
  const checks = nodes(app.sessionView()).filter(n => n.props?.onClick && text(n) === 'check');
  checks[1].props.onClick();
  assert.equal(app.lastTwoFor('hammer-curl').length, 1);
  assert.equal(app.lastTwoFor('hammer-curl')[0].rows.length, 1);
  assert.equal(app.state.logs[app.todayKey()].sets['hammer-curl'].filter(r => r.done).length, 2);
  app.resetExerciseProgress(['hammer-curl']);
  assert.equal(app.lastTwoFor('hammer-curl').length, 0);
});

test('unchecking a pre-reset completed set does not bring deleted progress back', () => {
  const { app } = fixture();
  app.startSession('upperB');
  app.state.curEx = app.dayById('upperB').exercises.findIndex(x => x.id === 'hammer-curl');
  action(app.sessionView(), 'check').props.onClick();
  app.resetExerciseProgress(['hammer-curl']);
  action(app.sessionView(), 'check').props.onClick();
  assert.equal(app.lastTwoFor('hammer-curl').length, 0);
  assert.equal(app.allLoggedExercises().filter(x => x.id === 'hammer-curl').length, 0);
});

test('Progress uses the saved daily metadata after the source exercise is deleted on another day', () => {
  const f = fixture(), { app } = f;
  const custom = app.newExercise('Timed breathing hold', 'Core', '—');
  custom.rir = '—'; custom.timed = true;
  app.dayById('upperB').exercises.push(custom);
  app.addDailyExercise('upperA', custom.id);
  app.startSession('upperA');
  app.state.curEx = app.workoutDay('upperA').exercises.findIndex(x => x.id === custom.id);
  action(app.sessionView(), 'check').props.onClick();
  app.dayById('upperB').exercises.pop();
  f.setDate('2026-10-05');
  app.state.progPick = custom.id;
  const progress = text(app.screenProgress());
  assert.ok(progress.includes(custom.name));
  assert.ok(progress.includes('8 s'), 'the timed set must remain seconds in Progress');
  assert.ok(!progress.includes('8 reps'));
});

test('Progress selection deletes multiple trackers and keeps removed routine exercises in History', () => {
  const { app } = fixture();
  logged(app, '2026-10-02', 'hammer-curl');
  logged(app, '2026-10-03', 'incline-curl');
  app.dayById('upperB').exercises = app.dayById('upperB').exercises.filter(x => x.id !== 'hammer-curl');
  app.state.progPickOpen = true;
  action(app.exPickerSheet(), 'Select').props.onClick();
  const checkboxes = nodes(app.exPickerSheet()).filter(n => n.props?.role === 'checkbox');
  assert.equal(checkboxes.length, 2);
  checkboxes[0].props.onClick();
  nodes(app.exPickerSheet()).filter(n => n.props?.role === 'checkbox')[1].props.onClick();
  action(app.exPickerSheet(), 'deleteDelete progress (2)').props.onClick();
  assert.equal(app.allLoggedExercises().length, 0);
  assert.equal(app.loggedDates().length, 2);
  assert.ok(text(app.screenProgress()).includes('Select exercise'));
});

test('custom cardio persists, prevents duplicate names and contributes to all existing summaries', () => {
  const f = fixture(), { app } = f;
  assert.equal(typeof app.createCardioType, 'function', 'custom cardio types must be supported');
  const type = app.createCardioType('  Rowing  ');
  assert.equal(type.name, 'Rowing');
  assert.equal(app.createCardioType('rowing'), null);
  assert.equal(app.createCardioType(' TREADMILL '), null);
  assert.equal(app.createCardioType('   '), null);
  app.addCardio(type.id, 18);
  app.addCardio('cycling', 12);
  assert.equal(app.cardioTotalsLast(7).total, 30);
  assert.equal(app.cardioTotalsLast(7).byType[type.id], 18);
  assert.equal(app.cardioPerDay(14).at(-1).min, 30);
  assert.ok(text(app.screenCardio()).includes('Rowing 18'));
  assert.ok(text(app.screenCardio()).includes('18 min'));
  const restored = f.reload().app;
  assert.ok(restored.cardioTypes().some(x => x.id === type.id && x.name === 'Rowing'));
});

test('the Cardio Add dialog creates and selects a custom type', () => {
  const { app } = fixture();
  const add = nodes(app.screenCardio()).find(n => n.props?.['aria-label'] === 'Add cardio exercise');
  assert.ok(add, 'Cardio must offer an Add control');
  add.props.onClick();
  const input = nodes(app.cardioCreateSheet()).find(n => n.type === 'input');
  input.props.onInput({ target: { value: 'Stair climber' } });
  action(app.cardioCreateSheet(), 'Create').props.onClick();
  assert.equal(app.cardioTypes().find(x => x.id === app.state.cardioPick).name, 'Stair climber');
  assert.equal(app.state.cardioCreateOpen, false);
});

test('backup round trips day-only exercises, progress resets and custom cardio; old backups still restore', () => {
  const { app, context } = fixture();
  assert.equal(typeof app.addDailyExercise, 'function');
  app.addDailyExercise('upperA', 'hammer-curl');
  logged(app, '2026-10-03', 'hammer-curl');
  app.resetExerciseProgress(['hammer-curl']);
  const cardio = app.createCardioType('Swimming');
  app.addCardio(cardio.id, 20);
  app.exportBackup();
  const restored = fixture().app;
  restored.importBackup(JSON.stringify(context.backup));
  assert.equal(restored.workoutDay('upperA').exercises.at(-1).id, 'hammer-curl');
  assert.equal(restored.seriesFor('hammer-curl').length, 0);
  assert.equal(restored.cardioTypes().at(-1).name, 'Swimming');
  assert.equal(restored.cardioTotalsLast(7).byType[cardio.id], 20);
  restored.importBackup(JSON.stringify({ program: app.state.program, logs: { '2026-10-03': { day: 'upperB', sets: { 'hammer-curl': [{ w: 20, r: 10, done: true }] } } }, version: 2 }));
  assert.equal(restored.seriesFor('hammer-curl').length, 1);
  assert.equal(restored.workoutDay('upperA').exercises.length, restored.dayById('upperA').exercises.length);
});
