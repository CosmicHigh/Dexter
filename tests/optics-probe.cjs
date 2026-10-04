const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

async function main() {
  const directory = process.env.DEXTER_EVIDENCE_DIR || path.join(os.tmpdir(), 'dexter-liquid-glass-evidence');
  fs.mkdirSync(directory, { recursive:true });
  const browser = await chromium.launch({ executablePath:process.env.DEXTER_CHROMIUM_PATH || undefined, headless:true, args:['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport:{width:390,height:780} });
    const html = fs.readFileSync(path.join(__dirname,'../docs/liquid-glass/optics-prototype.html'),'utf8');
    await page.setContent(html);
    await page.screenshot({path:path.join(directory,'optics-baseline.png')});
    const labels = await page.locator('.control span').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
    await page.getByRole('button',{name:'Compare enhanced rim'}).click();
    await page.screenshot({path:path.join(directory,'optics-candidate.png')});
    const after = await page.locator('.control span').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
    assert.deepEqual(after,labels,'Refraction may not change label geometry');
    const filter = await page.locator('.tab .material').evaluate(node=>getComputedStyle(node).backdropFilter);
    const output={browser:browser.version(),candidateBackdropFilter:filter,stableLabelGeometry:true,uniqueFilterIDs:await page.locator('filter').evaluateAll(nodes=>nodes.map(node=>node.id)),retainedInProduct:false,
      decision:'Disabled in production: CSS accepts the URL recipe and both rendering variants are captured for inspection, but official reference comparison and the required Android optical/performance gate are unavailable. Ship the real blur baseline.'};
    fs.writeFileSync(path.join(directory,'optics-report.json'),JSON.stringify(output,null,2));
    process.stdout.write(JSON.stringify(output)+'\n');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
