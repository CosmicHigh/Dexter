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

test('Today opens a picker of saved exercises not already in this workout', () => {
  const { app } = fixture();
  action(app.screenToday(), 'addAdd').props.onClick();
  assert.equal(app.state.todayPickDay, 'upperA');
  app.dayById('lowerA').exercises.push(app.deepCopy(app.dayById('upperB').exercises.find(x => x.id === 'hammer-curl')));
  app.dayById('upperB').exercises = app.dayById('upperB').exercises.filter(x => x.id !== 'incline-curl');
  const names = nodes(app.todayExerciseSheet()).filter(n => n.props?.onClick).map(text);
  assert.equal(names.filter(n => n.includes('Hammer Curl')).length, 1);
  assert.ok(names.some(n => n.includes('Incline DB Curl')), 'removing a routine assignment must retain the saved exercise');
  assert.ok(!names.some(n => n.includes('Incline DB Press')));
});

test('removing the last routine assignment keeps its full editable definition and progress after reload', () => {
  const f = fixture(), { app } = f;
  const ex = app.deepCopy(app.dayById('lowerA').exercises.find(x => x.id === 'leg-extension'));
  logged(app, '2026-10-03', ex.id, 65, 15);
  app.state.editor = { view: 'day', dayId: 'lowerA' };
  nodes(app.editorSheet()).find(n => n.props?.['aria-label'] === 'Remove exercise · Leg Extension').props.onClick();
  const restored = f.reload().app;
  assert.ok(!restored.dayById('lowerA').exercises.some(x => x.id === ex.id));
  assert.deepEqual(plain(restored.exerciseMeta(ex.id)), plain(ex));
  assert.equal(restored.allLoggedExercises().find(x => x.id === ex.id).name, 'Leg Extension');
  assert.ok(restored.availableDailyExercises('lowerA').some(x => x.id === ex.id));
  restored.state.editor = { view: 'addex', dayId: 'lowerA' };
  const savedRow = nodes(restored.editorSheet()).find(n => n.props?.onClick && text(n).includes('Leg Extension') && text(n).includes('Quads'));
  assert.ok(savedRow, 'routine Add must include the saved definition');
  savedRow.props.onClick();
  restored.state.editor = { view: 'ex', dayId: 'lowerA', exId: ex.id };
  assert.equal(nodes(restored.editorSheet()).find(n => n.type === 'textarea').props.defaultValue, ex.ref);
});

test('legacy orphaned progress recovers pre-made names and creates editable saved records for unknown IDs', () => {
  const original = fixture().app;
  original.dayById('lowerA').exercises = original.dayById('lowerA').exercises.filter(x => x.id !== 'leg-extension');
  const history = { '2026-10-03': { day: 'lowerA', sets: {
    'leg-extension': [{ w: 65, r: 15, done: true }],
    'old-custom-movement': [{ w: 20, r: 8, done: true }],
  } } };
  const { app } = fixture({ program: original.state.program, logs: history, version: 2 });
  assert.equal(app.allLoggedExercises().find(x => x.id === 'leg-extension').name, 'Leg Extension');
  assert.equal(app.exerciseMeta('old-custom-movement').name, 'Old Custom Movement');
  for (const ex of app.allLoggedExercises()) assert.ok(app.savedExercises().some(saved => saved.id === ex.id));
  assert.equal(JSON.stringify(app.state.logs), JSON.stringify(history));
});

test('legacy blank-name records retain their edited features and routine membership with or without logs', () => {
  for (const id of ['leg-extension', 'old-custom']) {
    const original = fixture().app;
    const ex = Object.assign(original.newExercise('   ', 'Custom core'), { id, sets: 7, timed: true, ref: 'Important cue', rir: '—' });
    const program = { weekPlan: Array(7).fill('custom-day'), days: [{ id: 'custom-day', name: 'Custom', exercises: [ex] }] };
    for (const logs of [{}, { '2026-10-03': { day: 'custom-day', sets: { [id]: [{ w: 0, r: 45, done: true }] } } }]) {
      const { app } = fixture({ program, logs });
      assert.equal(app.dayById('custom-day').exercises.length, 1);
      const saved = app.savedExercises().find(x => x.id === id);
      assert.ok(saved.name.trim());
      assert.equal(saved.sets, 7); assert.equal(saved.timed, true); assert.equal(saved.ref, 'Important cue');
      if (Object.keys(logs).length) {
        app.state.progPick = id;
        assert.ok(text(app.screenProgress()).includes('45 s'));
      }
    }
  }
});

test('legacy same-name IDs share one progress series without rewriting History or routine prescriptions', () => {
  const original = fixture().app.defaultProgram();
  const history = {
    '2026-10-02': { day: 'lowerA', sets: { 'seated-leg-curl': [{ w: 40, r: 12, done: true }] } },
    '2026-10-03': { day: 'lowerB', sets: { 'seated-leg-curl-b': [{ w: 45, r: 10, done: true }] } },
  };
  const { app } = fixture({ program: original, logs: history });
  const curl = app.allLoggedExercises().filter(x => x.name.toLowerCase() === 'seated leg curl');
  assert.equal(curl.length, 1);
  assert.equal(app.seriesFor(curl[0].id).length, 2);
  assert.equal(app.lastRowsFor(curl[0].id)[0].w, 45);
  assert.equal(app.dayById('lowerA').exercises.find(x => x.name === 'Seated Leg Curl').sets, 3);
  assert.equal(app.dayById('lowerB').exercises.find(x => x.name === 'Seated Leg Curl').sets, 4);
  assert.equal(JSON.stringify(app.state.logs), JSON.stringify(history));
});

test('renaming to an existing name merges progress only after the completed name is committed', () => {
  const f = fixture(), { app } = f;
  const source = app.dayById('upperB').exercises.find(x => x.id === 'incline-curl');
  logged(app, '2026-10-02', source.id, 15, 10);
  logged(app, '2026-10-03', 'hammer-curl', 20, 12);
  const history = JSON.stringify(app.state.logs);
  app.state.editor = { view: 'ex', dayId: 'upperB', exId: source.id };
  const name = nodes(app.editorSheet()).find(n => n.type === 'input' && n.props.placeholder === 'Name');
  name.props.onInput({ target: { value: 'Hammer Curl' } });
  name.props.onInput({ target: { value: '  hAMMER   curl  ' } });
  assert.equal(app.allLoggedExercises().length, 2, 'typing a partial name must not merge records');
  assert.equal(typeof name.props.onBlur, 'function');
  name.props.onBlur();
  const list = app.allLoggedExercises();
  assert.equal(list.length, 1);
  assert.equal(app.seriesFor(list[0].id).length, 2);
  assert.equal(app.savedExercises().filter(x => x.name.toLowerCase() === 'hammer curl').length, 1);
  assert.equal(app.dayById('upperB').exercises.filter(x => x.id === list[0].id).length, 1);
  assert.equal(JSON.stringify(app.state.logs), history);
  assert.equal(f.reload().app.allLoggedExercises().length, 1);
});

test('repeated distinct and case-only renames retain identity and shared editable features', () => {
  const f = fixture(), { app } = f;
  logged(app, '2026-10-03', 'hammer-curl', 25, 12);
  app.dayById('upperA').exercises.push(app.deepCopy(app.exerciseMeta('hammer-curl')));
  app.state.editor = { view: 'ex', dayId: 'upperB', exId: 'hammer-curl' };
  for (const value of ['Lying Leg Curl', 'LYING leg curl', 'Lying Leg Curl']) {
    const input = nodes(app.editorSheet()).find(n => n.type === 'input' && n.props.placeholder === 'Name');
    input.props.onInput({ target: { value } }); input.props.onBlur();
  }
  const form = app.editorSheet();
  nodes(form).find(n => n.type === 'textarea').props.onInput({ target: { value: 'Shared cue' } });
  nodes(form).find(n => n.props?.role === 'switch' && n.props['aria-label'] === 'Timed (seconds)').props.onClick();
  const restored = f.reload().app;
  assert.equal(restored.allLoggedExercises().find(x => x.id === 'hammer-curl').name, 'Lying Leg Curl');
  assert.equal(restored.seriesFor('hammer-curl').length, 1);
  for (const day of ['upperA', 'upperB']) {
    const ex = restored.workoutDay(day).exercises.find(x => x.id === 'hammer-curl');
    assert.equal(ex.ref, 'Shared cue'); assert.equal(ex.timed, true);
  }
});

test('same-name daily creations reuse saved features and history instead of creating duplicates', () => {
  const f = fixture(), { app } = f;
  logged(app, '2026-10-03', 'hammer-curl', 25, 12);
  const draft = app.newExercise('  HAMMER curl ', 'Custom', '—');
  assert.equal(app.createDailyExercise('upperA', draft, app.todayKey()), true);
  assert.equal(app.dailyExtras('upperA')[0].id, 'hammer-curl');
  assert.equal(app.dailyExtras('upperA')[0].primary, 'Brachialis · Brachioradialis');
  assert.equal(app.createDailyExercise('upperA', app.newExercise('hammer curl', 'Custom'), app.todayKey()), false);
  assert.equal(f.reload().app.savedExercises().filter(x => x.name.toLowerCase() === 'hammer curl').length, 1);
});

test('Progress deletion removes all saved assignments but preserves named History and stays deleted after reload', () => {
  const f = fixture(), { app } = f;
  app.addDailyExercise('upperA', 'hammer-curl');
  logged(app, '2026-10-03', 'hammer-curl', 25, 12);
  const history = JSON.stringify(app.state.logs), before = plain(app.daySummary('2026-10-03'));
  app.state.progPickOpen = true;
  action(app.exPickerSheet(), 'Select').props.onClick();
  nodes(app.exPickerSheet()).find(n => n.props?.role === 'checkbox').props.onClick();
  action(app.exPickerSheet(), 'deleteDelete progress (1)').props.onClick();
  const restored = f.reload().app;
  assert.equal(restored.allLoggedExercises().length, 0);
  assert.ok(!restored.savedExercises().some(x => x.id === 'hammer-curl'));
  assert.ok(!restored.activeExercises().some(x => x.id === 'hammer-curl'));
  assert.ok(!restored.dailyExtras('upperA').some(x => x.id === 'hammer-curl'));
  assert.equal(JSON.stringify(restored.state.logs), history);
  assert.deepEqual(plain(restored.daySummary('2026-10-03')), before);
  restored.state.dayDetail = '2026-10-03';
  assert.ok(text(restored.dayDetailSheet()).includes('Hammer Curl'));
  assert.ok(text(restored.dayDetailSheet()).includes('25 kg × 12'));
});

test('deleted names can be explicitly recreated with fresh progress without reviving archived tracking', () => {
  const { app } = fixture();
  logged(app, '2026-10-03', 'hammer-curl', 25, 12);
  assert.equal(typeof app.deleteSavedExercises, 'function');
  app.deleteSavedExercises(['hammer-curl']);
  const draft = app.newExercise('Hammer Curl', 'Biceps');
  assert.equal(app.createDailyExercise('upperA', draft, app.todayKey()), true);
  assert.notEqual(app.dailyExtras('upperA')[0].id, 'hammer-curl');
  assert.equal(app.seriesFor(draft.id).length, 0);
  assert.equal(app.seriesFor('hammer-curl').length, 0);
  assert.equal(app.lastRowsFor(draft.id), null);
});

test('merged aliases keep independent legacy reset boundaries and all same-day completed sets', () => {
  const program = fixture().app.defaultProgram();
  const history = { '2026-10-03': { day: 'lowerA', sets: {
    'seated-leg-curl': [{ w: 40, r: 12, done: true }, { w: 42, r: 10, done: true, progressVersion: 1 }],
    'seated-leg-curl-b': [{ w: 45, r: 10, done: true }],
  } } };
  const { app } = fixture({ program, logs: history, progressResets: { 'seated-leg-curl': 1 } });
  const ex = app.allLoggedExercises()[0];
  assert.equal(app.allLoggedExercises().length, 1);
  assert.deepEqual(plain(app.lastTwoFor(ex.id)[0].rows.map(r => r.w)), [42, 45]);
  assert.equal(JSON.stringify(app.state.logs), JSON.stringify(history));
});

test('legacy shared features are displayed consistently in the routine editor and workout', () => {
  const program = fixture().app.defaultProgram();
  const first = program.days[0].exercises.find(ex => ex.id === 'seated-leg-curl');
  first.timed = true; first.ref = 'Canonical feature';
  const { app } = fixture({ program });
  const ex = app.workoutDay('lowerB').exercises.find(ex => ex.name === 'Seated Leg Curl');
  app.state.editor = { view: 'ex', dayId: 'lowerB', exId: ex.id };
  const form = app.editorSheet();
  assert.equal(nodes(form).find(n => n.type === 'textarea').props.defaultValue, ex.ref);
  const timed = nodes(form).find(n => n.props?.role === 'switch' && n.props['aria-label'] === 'Timed (seconds)');
  assert.equal(timed.props['aria-checked'], true);
  timed.props.onClick();
  assert.equal(app.workoutDay('lowerA').exercises.find(item => item.id === ex.id).timed, false);
});

test('alias migration renders one History exercise with all original sets instead of a phantom skipped entry', () => {
  const program = fixture().app.defaultProgram();
  const { app } = fixture({ program, logs: { '2026-10-03': { day: 'lowerB', sets: {
    'seated-leg-curl-b': [{ w: 45, r: 10, done: true }],
    'seated-leg-curl': [{ w: 40, r: 12, done: true }],
  } } } });
  app.state.dayDetail = '2026-10-03';
  const rows = nodes(app.dayDetailSheet()).filter(n => n.props?.className === 'history-detail-row' && text(n).includes('Seated Leg Curl'));
  assert.equal(rows.length, 1);
  assert.ok(text(rows[0]).includes('45 kg × 10'));
  assert.ok(text(rows[0]).includes('40 kg × 12'));
});

test('merging weighted and timed names preserves the original units of every historical set after deletion', () => {
  for (const legacy of [false, true]) {
    const f = fixture(), { app } = f;
    app.addDailyExercise('upperB', 'plank');
    app.startSession('upperB');
    app.state.logs[app.todayKey()].sets['hammer-curl'][0] = { w: 25, r: 12, done: true };
    app.state.logs[app.todayKey()].sets.plank[0] = { w: 0, r: 45, done: true };
    if (legacy) delete app.state.logs[app.todayKey()].exercises;
    f.setDate('2026-10-05');
    app.updateExercise('hammer-curl', { name: 'Plank' });
    app.state.dayDetail = '2026-10-04';
    assert.ok(text(app.dayDetailSheet()).includes('25 kg × 12'));
    assert.ok(text(app.dayDetailSheet()).includes('45 s'));
    app.deleteSavedExercises(['plank']);
    const restored = f.reload().app;
    restored.state.dayDetail = '2026-10-04';
    assert.ok(text(restored.dayDetailSheet()).includes('25 kg × 12'));
    assert.ok(text(restored.dayDetailSheet()).includes('45 s'));
  }
});

test('reopening a same-day merged session preserves historical metadata when alias rows move', () => {
  const f = fixture(), { app } = f;
  app.addDailyExercise('upperB', 'plank'); app.startSession('upperB');
  app.state.curEx = app.workoutDay('upperB').exercises.findIndex(ex => ex.id === 'hammer-curl');
  action(app.sessionView(), 'check').props.onClick();
  app.state.logs[app.todayKey()].sets['hammer-curl'][0].w = 25;
  app.state.logs[app.todayKey()].sets['hammer-curl'][0].r = 12;
  app.state.curEx = app.workoutDay('upperB').exercises.findIndex(ex => ex.id === 'plank');
  action(app.sessionView(), 'check').props.onClick();
  app.state.logs[app.todayKey()].sets.plank[0].r = 45;
  app.endSession(); app.updateExercise('hammer-curl', { name: 'Plank' });
  app.startSession('upperB'); app.endSession();
  app.state.dayDetail = app.todayKey();
  assert.ok(text(app.dayDetailSheet()).includes('25 kg × 12'));
  assert.ok(text(app.dayDetailSheet()).includes('45 s'));
  app.deleteSavedExercises(['plank']);
  const restored = f.reload().app; restored.state.dayDetail = app.todayKey();
  assert.ok(text(restored.dayDetailSheet()).includes('25 kg × 12'));
  assert.ok(text(restored.dayDetailSheet()).includes('45 s'));
});

test('unrecorded alias placeholders capture current timed metadata when first completed after a merge', () => {
  const f = fixture(), { app } = f;
  app.startSession('upperB'); app.endSession();
  app.updateExercise('hammer-curl', { name: 'Plank' });
  app.startSession('upperB');
  app.state.curEx = app.workoutDay('upperB').exercises.findIndex(ex => ex.id === 'plank');
  action(app.sessionView(), 'check').props.onClick();
  const row = app.state.logs[app.todayKey()].sets.plank.find(row => row.done);
  assert.equal(row.historyMeta.timed, true);
  app.state.dayDetail = app.todayKey();
  assert.ok(text(app.dayDetailSheet()).includes(row.r + ' s'));
});

test('reopening a migrated same-day session never trims completed alias sets to its routine set count', () => {
  const program = fixture().app.defaultProgram();
  const { app } = fixture({ program, logs: { '2026-10-04': { day: 'lowerA', sets: {
    'seated-leg-curl': [{ w: 40, r: 12, done: true }, { w: 40, r: 11, done: true }],
    'seated-leg-curl-b': [{ w: 45, r: 10, done: true }, { w: 45, r: 9, done: true }],
  } } } });
  app.startSession('lowerA');
  assert.equal(app.lastTwoFor('seated-leg-curl')[0].rows.length, 4);
  app.sessionView();
  assert.equal(app.lastTwoFor('seated-leg-curl')[0].rows.length, 4);
});

test('saved records, aliases and deletions round-trip through backups while legacy restore replaces the library', () => {
  const { app, context } = fixture();
  logged(app, '2026-10-03', 'leg-extension', 65, 15);
  app.state.editor = { view: 'day', dayId: 'lowerA' };
  nodes(app.editorSheet()).find(n => n.props?.['aria-label'] === 'Remove exercise · Leg Extension').props.onClick();
  app.deleteSavedExercises(['hammer-curl']);
  app.exportBackup();
  const restored = fixture().app;
  restored.importBackup(JSON.stringify(context.backup));
  assert.ok(restored.savedExercises().some(x => x.id === 'leg-extension'));
  assert.ok(!restored.savedExercises().some(x => x.id === 'hammer-curl'));
  restored.importBackup(JSON.stringify({ program: restored.defaultProgram(), logs: {}, version: 2 }));
  assert.ok(restored.savedExercises().some(x => x.id === 'hammer-curl'));
  assert.equal(restored.allLoggedExercises().length, 0);
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

test('day-only Add creates a configured exercise through the shared form without changing the routine', () => {
  const f = fixture(), { app, storage } = f;
  const program = JSON.stringify(app.state.program), before = storage.get(app.LSKEY);
  app.state.todayPickDay = 'upperA';
  action(app.todayExerciseSheet(), 'addCreate custom exercise').props.onClick();
  assert.equal(app.state.editor.scope, 'daily-create');
  assert.equal(nodes(app.editorSheet()).find(n => n.props?.role === 'dialog').props['aria-label'], 'Create exercise for today');
  const edit = (placeholder, value) => {
    const input = nodes(app.editorSheet()).find(n => n.type === 'input' && n.props.placeholder === placeholder);
    assert.ok(input, `The shared ${placeholder} field must be available`);
    input.props.onInput({ target: { value } });
  };
  edit('Name', '  Cable rotation  '); edit('Primary', 'Obliques'); edit('Assist', 'Core');
  const sets = nodes(app.editorSheet()).find(n => n.props?.['aria-label'] === 'Increase Sets');
  sets.props.onClick();
  const flag = nodes(app.editorSheet()).find(n => n.props?.role === 'switch' && n.props['aria-label'] === 'Timed (seconds)');
  flag.props.onClick();
  nodes(app.editorSheet()).find(n => n.type === 'textarea').props.onInput({ target: { value: 'Controlled rotation.' } });
  assert.equal(storage.get(app.LSKEY), before, 'Editing a draft must not save a placeholder exercise');
  const id = app.state.editor.exercise.id;
  action(app.editorSheet(), 'Add for today').props.onClick();
  const created = app.dailyExtras('upperA')[0];
  assert.equal(created.id, id);
  assert.equal(created.name, 'Cable rotation'); assert.equal(created.primary, 'Obliques');
  assert.equal(created.sets, 4); assert.equal(created.timed, true); assert.equal(created.ref, 'Controlled rotation.');
  assert.equal(JSON.stringify(app.state.program), program);
  assert.equal(app.state.editor, null);
  assert.equal(f.reload().app.workoutDay('upperA').exercises.at(-1).id, id);
  app.startSession('upperA');
  app.state.curEx = app.workoutDay('upperA').exercises.findIndex(ex => ex.id === id);
  nodes(app.sessionView()).find(n => n.props?.['aria-label'] === 'Complete set 1').props.onClick();
  assert.equal(app.state.logs[app.todayKey()].sets[id][0].done, true);
  app.exportBackup();
  assert.equal(f.context.backup.dailyExercises[app.todayKey()].upperA[0].id, id);
  f.setDate('2026-10-05');
  assert.ok(!app.workoutDay('upperA').exercises.some(ex => ex.id === id));
  app.state.dayDetail = '2026-10-04';
  assert.ok(text(app.dayDetailSheet()).includes('Cable rotation'), 'Historical metadata must survive the day change');
});

test('cancelling or submitting an empty day-only draft preserves workouts and the routine', () => {
  const { app, storage } = fixture();
  const before = storage.get(app.LSKEY), program = JSON.stringify(app.state.program);
  app.state.todayPickDay = 'upperA';
  action(app.todayExerciseSheet(), 'addCreate custom exercise').props.onClick();
  action(app.editorSheet(), 'Add for today').props.onClick();
  assert.equal(storage.get(app.LSKEY), before);
  assert.equal(app.dailyExtras('upperA').length, 0);
  nodes(app.editorSheet()).find(n => n.props?.['aria-label'] === 'Back').props.onClick();
  assert.equal(app.state.editor, null);
  assert.equal(app.state.todayPickDay, 'upperA');
  assert.equal(JSON.stringify(app.state.program), program);
  assert.equal(storage.get(app.LSKEY), before);
});

test('new day-only creation initializes an active session and rejects stale or duplicate submissions', () => {
  const f = fixture(), { app } = f;
  app.startSession('upperA');
  const program = JSON.stringify(app.state.program);
  const ex = app.newExercise('New accessory', 'Back', 'Biceps');
  assert.equal(typeof app.createDailyExercise, 'function');
  assert.equal(app.createDailyExercise('upperA', ex, app.todayKey()), true);
  assert.equal(app.state.logs[app.todayKey()].sets[ex.id].length, ex.sets);
  assert.equal(app.createDailyExercise('upperA', ex, app.todayKey()), false);
  assert.equal(app.dailyExtras('upperA').length, 1);
  const next = app.newExercise('Another accessory', 'Back', 'Biceps');
  f.setDate('2026-10-05');
  assert.equal(app.createDailyExercise('upperA', next, '2026-10-04'), false);
  assert.equal(app.dailyExtras('upperA').length, 0);
  assert.equal(JSON.stringify(app.state.program), program);
});

test('the shared routine editor still creates permanent exercises and saves their fields', () => {
  const f = fixture(), { app, storage } = f;
  app.state.editor = { view: 'addex', dayId: 'upperA' };
  action(app.editorSheet(), 'addCreate custom exercise').props.onClick();
  const id = app.state.editor.exId;
  assert.ok(!app.dayById('upperA').exercises.some(ex => ex.id === id), 'creation remains a draft until submitted');
  const form = app.editorSheet();
  nodes(form).find(n => n.type === 'input' && n.props.placeholder === 'Name').props.onInput({ target: { value: 'Permanent accessory' } });
  nodes(form).find(n => n.type === 'textarea').props.onInput({ target: { value: 'Routine cue' } });
  nodes(form).find(n => n.props?.['aria-label'] === 'Increase Sets').props.onClick();
  action(app.editorSheet(), 'Add to routine').props.onClick();
  const saved = JSON.parse(storage.get(app.LSKEY)).program.days.find(day => day.id === 'upperA').exercises.find(ex => ex.id === id);
  assert.equal(saved.name, 'Permanent accessory');
  assert.equal(saved.ref, 'Routine cue');
  assert.equal(saved.sets, 4);
  assert.equal(app.dailyExtras('upperA').length, 0);
  assert.equal(f.reload().app.dayById('upperA').exercises.at(-1).id, id);
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
