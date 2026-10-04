// Pixel tests, not a check that CSS merely contains the word "blur".
// Run with Playwright Chromium and pngjs. No production fixture or texture ships.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const asset = path.join(__dirname, '../app/src/main/assets/Dexter.html');
const output = process.env.DEXTER_EVIDENCE_DIR || path.join(os.tmpdir(), 'dexter-material-optics');

async function appCall(page, callback, arg) {
  return page.evaluate(({ source, arg }) => {
    const root = document.querySelector('.dexter-app');
    const key = Object.keys(root).find(key => key.startsWith('__reactFiber$'));
    for (let fiber = root[key]; fiber; fiber = fiber.return) {
      if (fiber.stateNode?.logic) return (0, eval)(`(${source})`)(fiber.stateNode.logic, arg);
    }
    throw new Error('Mounted app missing');
  }, { source: callback.toString(), arg });
}

async function settle(page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function statistics(buffer) {
  const image = PNG.sync.read(buffer);
  const values = [];
  const mean = [0, 0, 0];
  // Ignore borders, rounding and text. The isolated probe has no glyphs.
  for (let y = 12; y < image.height - 12; y++) for (let x = 12; x < image.width - 12; x++) {
    const offset = (y * image.width + x) * 4;
    const color = Array.from(image.data.subarray(offset, offset + 3));
    values.push(color);
    color.forEach((value, i) => { mean[i] += value; });
  }
  mean.forEach((value, i) => { mean[i] = value / values.length; });
  const variance = values.reduce((sum, color) => sum + color.reduce((total, value, i) => total + (value - mean[i]) ** 2, 0), 0) / values.length;
  return { mean, variance };
}

async function capture(page, name) {
  await settle(page);
  const buffer = await page.locator('[data-material-probe]').screenshot();
  fs.writeFileSync(path.join(output, `${name}.png`), buffer);
  return statistics(buffer);
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const html = fs.readFileSync(asset);
  const server = http.createServer((req, res) => {
    if (req.headers['sec-fetch-dest'] !== 'document') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.DEXTER_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('tab', { name: 'Today', exact: true }).waitFor();

    // Apply production selectors/tokens to a text-free probe at the same depth
    // as the content. Checker stripes reveal real blur, unlike a uniform fill.
    await page.evaluate(() => {
      const scene = document.createElement('div');
      scene.id = 'optics-scene';
      scene.style.cssText = 'position:absolute;inset:0;z-index:120;pointer-events:none;';
      scene.innerHTML = '<div id="optics-backdrop" style="position:absolute;inset:0"></div><div id="optics-panel" style="position:absolute;left:38px;top:88px;width:304px;height:124px;margin:0;padding:12px;border-radius:28px"><div data-material-probe style="position:absolute;left:12px;top:12px;width:280px;height:100px;margin:0;padding:0;border-radius:28px"></div></div>';
      document.querySelector('.app-column').appendChild(scene);
    });

    for (const theme of ['dark', 'light']) {
      await appCall(page, (app, theme) => { app.state.theme = theme; app.forceUpdate(); }, theme);
      for (const material of ['content-card', 'stepper', 'primary-button', 'glass sheet-surface', 'nested-stepper']) {
        await page.locator('#optics-panel').evaluate((node, material) => { node.className = material === 'nested-stepper' ? 'set-row' : ''; }, material);
        await page.locator('[data-material-probe]').evaluate((node, material) => { node.className = material === 'nested-stepper' ? 'stepper' : material; }, material);
        await page.locator('#optics-backdrop').evaluate(node => { node.style.background = 'repeating-linear-gradient(90deg,#224466 0 4px,#b4d2ec 4px 8px)'; });
        const blurred = await capture(page, `${theme}-${material.replaceAll(' ', '-')}-blurred`);
        if (material === 'nested-stepper') {
          const childOverride = await page.addStyleTag({ content: '[data-material-probe] { backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }' });
          const parentOnly = await capture(page, `${theme}-nested-stepper-parent-only`);
          await childOverride.evaluate(node => node.remove());
          assert.ok(blurred.variance < parentOnly.variance * .25, `${theme}: the child stepper must sample through the panel, not just declare a filter`);
        }
        const override = await page.addStyleTag({ content: '[data-material-probe], [data-material-probe]::before, #optics-panel, #optics-panel::before { backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }' });
        const sharp = await capture(page, `${theme}-${material.replaceAll(' ', '-')}-unblurred`);
        await override.evaluate(node => node.remove());
        assert.ok(sharp.variance > 100, `${theme}/${material}: enough backdrop must be visible to distinguish stripes`);
        assert.ok(blurred.variance < sharp.variance * .25, `${theme}/${material}: real backdrop sampling must attenuate high-frequency stripes`);

        await page.locator('#optics-backdrop').evaluate(node => { node.style.background = '#225599'; });
        const blue = await capture(page, `${theme}-${material.replaceAll(' ', '-')}-blue`);
        await page.locator('#optics-backdrop').evaluate(node => { node.style.background = '#AA5533'; });
        const orange = await capture(page, `${theme}-${material.replaceAll(' ', '-')}-orange`);
        const response = Math.hypot(...blue.mean.map((value, i) => value - orange.mean[i]));
        assert.ok(response > 65, `${theme}/${material}: changing the real scene must visibly change the material`);
        await appCall(page, app => app.setPresentation('reduceTransparency', true));
        const opaqueOrange = await capture(page, `${theme}-${material.replaceAll(' ', '-')}-opaque-orange`);
        await page.locator('#optics-backdrop').evaluate(node => { node.style.background = '#225599'; });
        const opaqueBlue = await capture(page, `${theme}-${material.replaceAll(' ', '-')}-opaque-blue`);
        assert.ok(Math.hypot(...opaqueBlue.mean.map((value, i) => value - opaqueOrange.mean[i])) < 1, `${theme}/${material}: reduction must remove scene dependency`);
        await appCall(page, app => app.setPresentation('reduceTransparency', false));
        results.push({ theme, material, blurredVariance: blurred.variance, unblurredVariance: sharp.variance, sceneResponse: response });
      }
    }
    // Check the mounted UI too, including a control inside a translucent panel.
    await page.locator('#optics-scene').evaluate(node => node.remove());
    await page.getByRole('tab', { name: 'Cardio', exact: true }).click();
    await settle(page);
    const active = await page.locator('.field-input').first().evaluate(node => getComputedStyle(node).backdropFilter);
    assert.notEqual(active, 'none', 'The mounted nested field must sample the backdrop');
    await page.getByRole('tab', { name: 'Today', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await settle(page);
    const sheet = page.getByRole('dialog');
    const medium = await sheet.evaluate(node => ({ filter: getComputedStyle(node).backdropFilter, fill: getComputedStyle(node).backgroundColor }));
    await page.getByRole('button', { name: 'Expand sheet', exact: true }).click();
    await settle(page);
    const large = await sheet.evaluate(node => ({ filter: getComputedStyle(node).backdropFilter, fill: getComputedStyle(node).backgroundColor }));
    assert.notEqual(medium.filter, 'none');
    assert.deepEqual(large, medium, 'Expanding a sheet must retain its optical material');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ kind: 'desktop pixel optics only; physical-device performance remains pending', results }, null, 2));
    process.stdout.write('Material optics passed: actual blur, dynamic scene response, reductions and consistent sheet detents.\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
