const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

async function main() {
  const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/Dexter.html'));
  const screenshotDir = process.env.DEXTER_SCREENSHOT_DIR || os.tmpdir();
  fs.mkdirSync(screenshotDir, { recursive:true });
  // Android loads the asset through file://, where the runtime's optional self-fetch fails.
  // Serve navigations only to reproduce that behavior without rewriting the production asset.
  const server = http.createServer((req, res) => {
    if (req.headers['sec-fetch-dest'] !== 'document') { res.statusCode=404; res.end(); return; }
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.DEXTER_CHROMIUM_PATH ? { executablePath:process.env.DEXTER_CHROMIUM_PATH } : {}), headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      if (localStorage.getItem('dexter.material.v1')) return;
      const today = new Date();
      const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
      const ex = (id, name, sets) => ({ id, name, primary:'Biceps', assist:'—', sets, repLow:8, repHigh:12, rir:'1–2', timed:false, ref:'Controlled movement.' });
      const data = { program:{ weekPlan:Array(7).fill('upperA'), days:[
        { id:'upperA', name:'Upper A', tag:'Push', exercises:[ex('bench','Bench press',1)] },
        { id:'upperB', name:'Upper B', tag:'Pull', exercises:[ex('curl','Dumbbell curls',2)] }
      ]}, logs:{ [key(yesterday)]:{ day:'upperB', sets:{ curl:[{w:12.5,r:10,done:true}] } } },bodyweight:[],cardio:[],phase:{training:'STANDARD',nutrition:'CUT',deloadWeeks:6},theme:'dark',accentKey:'violet' };
      localStorage.setItem('dexter.material.v1',JSON.stringify(data));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
    await page.getByText("Today's plan", { exact: true }).waitFor();
    await page.waitForTimeout(650);
    await page.screenshot({path:path.join(screenshotDir,'dexter-before-add.png')});
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('dexter.material.v1')));
    const originalProgram = JSON.stringify((await saved()).program);

    await page.getByRole('button', { name:'Add exercise for today' }).click();
    assert.equal(await page.getByRole('button', { name:/Dumbbell curls/ }).count(),1);
    assert.equal(await page.getByRole('button', { name:/Bench press/ }).count(),0);
    await page.waitForTimeout(650);
    await page.screenshot({path:path.join(screenshotDir,'dexter-add-exercise.png')});
    await page.getByRole('button', { name:/Dumbbell curls/ }).click();
    assert.equal(JSON.stringify((await saved()).program),originalProgram);
    await page.reload();
    await page.getByText('2 exercises · 3 sets',{exact:true}).waitFor();
    await page.getByRole('button', { name:/Start session/ }).click();
    await page.getByText('Dumbbell curls',{exact:true}).click();
    const checks = page.getByRole('button', { name:/^Complete set \d+$/ });
    await checks.first().click();
    const withWorkout = await saved();
    const today = Object.keys(withWorkout.logs).sort().at(-1);
    assert.equal(withWorkout.logs[today].sets.curl[0].w,12.5);
    assert.equal(withWorkout.logs[today].sets.curl[0].done,true);
    await page.getByRole('button', { name:/Finish session/ }).click();
    await page.getByRole('tab',{name:'Progress',exact:true}).click();
    await page.getByRole('button',{name:'Dumbbell curls',exact:true}).click();
    await page.getByRole('button', { name:'Select',exact:true }).click();
    await page.getByRole('checkbox').click();
    await page.waitForTimeout(650);
    await page.screenshot({path:path.join(screenshotDir,'dexter-delete-progress.png')});
    await page.getByRole('button', { name:/Delete progress \(1\)/ }).click();
    assert.deepEqual((await saved()).logs,withWorkout.logs);
    await page.getByText('No exercise progress to select. Log new sets to start tracking.',{exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('tab',{name:'History',exact:true}).click();
    await page.getByText('Upper A',{exact:true}).waitFor();
    await page.getByText('Upper B',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'Cardio',exact:true}).click();
    await page.getByRole('button', { name:'Add cardio exercise' }).click();
    await page.getByRole('textbox',{name:'Cardio exercise name'}).fill('Rowing');
    await page.getByRole('button',{name:'Create',exact:true}).click();
    await page.getByPlaceholder('min',{exact:true}).fill('18');
    await page.getByRole('button',{name:'Log',exact:true}).click();
    await page.getByText('This week: Rowing 18',{exact:true}).waitFor();
    await page.reload();
    await page.getByRole('tab',{name:'Cardio',exact:true}).click();
    await page.getByText('This week: Rowing 18',{exact:true}).waitFor();
    for (const width of [320,390,460]) {
      await page.setViewportSize({width,height:844});
      await page.waitForTimeout(650);
    await page.screenshot({path:path.join(screenshotDir,`dexter-cardio-${width}.png`)});
      assert.ok(await page.getByRole('button',{name:'Add cardio exercise'}).isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(errors,[]);
    process.stdout.write('Browser checks passed: day-only additions, shared tracking, progress deletion with History preserved, custom cardio, reloads, mobile widths 320/390/460. No page errors.\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(e => { console.error(e); process.exitCode=1; });
