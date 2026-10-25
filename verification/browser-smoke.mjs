/**
 * Optional browser interaction check. Requires esbuild and Playwright in the
 * executing environment, not new application dependencies. Capacitor is mocked
 * in this WEB-ONLY harness; this is NOT an Android or production Vite build.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(),'ritmo-browser-'));
let browser, server;
let checks=0;
try {
  await build({
    entryPoints:[join(root,'verification/browser-entry.tsx')], bundle:true,
    outfile:join(temporary,'app.js'), format:'iife', jsx:'automatic',
    plugins:[{name:'web-only-capacitor-test-double',setup(build){
      build.onResolve({filter:/^@capacitor\//},()=>({path:'capacitor-test-double',namespace:'test'}));
      build.onLoad({filter:/.*/,namespace:'test'},()=>({
        contents:`export const Capacitor={isNativePlatform:()=>false};
          export const registerPlugin=()=>new Proxy({},{get:()=>()=>Promise.reject(new Error('Native unavailable in browser fixture'))});`,
        loader:'js',
      }));
    }}],
  });
  server=createServer(async(req,res)=>{
    try {
      if(req.url==='/app.js'||req.url==='/app.css'){
        res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');
        res.end(await readFile(join(temporary,req.url.slice(1))));
      } else res.end(`<!doctype html><html lang="fa" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/app.css"><style>
        :root{--ritmo-background:#0a0c13;--ritmo-text:#f1f5f9;--ritmo-surface:#171923;--ritmo-muted:#94a3b8}
        body{margin:0;background:#0a0c13;color:#f1f5f9;font-family:Tahoma}button{font:inherit;background:none;border:0;color:inherit}
        .ritmo-playlist-detail{position:fixed;inset:0;overflow-y:auto}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden}
        </style><div id="root"></div><script src="/app.js"></script></html>`);
    } catch(error) {res.statusCode=500;res.end(String(error));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const state=()=>page.locator('#state').textContent().then(JSON.parse);
  const playlistRow=id=>page.locator('.ritmo-playlist-track').filter({has:page.locator(`.ritmo-playlist-track-main[aria-label$=\"آهنگ ${id.slice(6)}\"]`)});
  const row=id=>playlistRow(id).locator('.ritmo-playlist-track-main');
  const dragHandle=id=>playlistRow(id).locator('.ritmo-playlist-drag-handle');
  await row('audio-1').click();
  assert.equal((await state()).clicks,1);checks++;
  const from=await dragHandle('audio-1').boundingBox(), to=await row('audio-3').boundingBox();
  await page.mouse.move(from.x+20,from.y+25);await page.mouse.down();
  await page.waitForTimeout(460);
  assert.equal(await page.locator('.is-dragging').count(),1);checks++;
  await page.mouse.move(to.x+20,to.y+25,{steps:8});
  const preview=await page.evaluate(()=>{
    const source=document.querySelector('[data-track-index="0"]');
    const rows=[...document.querySelectorAll('[data-track-index]')];
    return {source:source?.style.transform||'',shifts:rows.filter(row=>row!==source&&row.style.transform.includes('translate3d')).map(row=>row.style.transform)};
  });
  assert.match(preview.source,/translate3d\(0px,\s*-?\d+px/);checks++;
  assert.doesNotMatch(preview.source,/translate3d\(0px,\s*0px/);checks++;
  assert.ok(preview.shifts.length>0);checks++;
  await page.mouse.up();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#state').textContent).ids.slice(0,3).join(',')
    ==='audio-2,audio-3,audio-1');
  assert.deepEqual((await state()).ids.slice(0,3),['audio-2','audio-3','audio-1']);checks++;
  assert.equal((await state()).clicks,1);checks++;
  await page.locator('#leave-playlist').click();
  await page.locator('#return-playlist').click();
  await page.locator('.ritmo-playlist-track').first().waitFor();
  assert.deepEqual((await state()).ids.slice(0,3),['audio-2','audio-3','audio-1']);checks++;
  await page.waitForTimeout(300); // let the preceding FLIP animation finish before taking new hit-test boxes
  const secondFrom=await dragHandle('audio-2').boundingBox(), secondTo=await row('audio-1').boundingBox();
  await page.mouse.move(secondFrom.x+18,secondFrom.y+20);await page.mouse.down();await page.waitForTimeout(460);
  await page.mouse.move(secondTo.x+20,secondTo.y+25,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#state').textContent).ids.slice(0,3).join(',')
    ==='audio-3,audio-1,audio-2');
  assert.deepEqual((await state()).ids.slice(0,3),['audio-3','audio-1','audio-2']);checks++;
  const before=(await state()).ids;
  const box=await dragHandle('audio-3').boundingBox();
  await page.mouse.move(box.x+20,box.y+25);await page.mouse.down();await page.waitForTimeout(460);
  await page.keyboard.press('Escape');await page.mouse.up();
  assert.deepEqual((await state()).ids,before);checks++;
  await page.evaluate(()=>document.querySelector('.ritmo-playlist-detail').scrollTop=0);
  const touch=await browser.newBrowserCDPSession().catch(()=>null);
  if(touch)await touch.detach();
  const cdp=await page.context().newCDPSession(page);
  const touchBox=await row('audio-3').boundingBox();
  const x=touchBox.x+30,y=touchBox.y+30;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*30}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await page.evaluate(()=>document.querySelector('.ritmo-playlist-detail').scrollTop)>80);checks++;
  assert.equal((await state()).clicks,1);checks++;
  // Auto-scroll while a real touch long-press remains active.
  await dragHandle('audio-3').scrollIntoViewIfNeeded();
  const dragBox=await dragHandle('audio-3').boundingBox();
  const initialScroll=await page.evaluate(()=>document.querySelector('.ritmo-playlist-detail').scrollTop);
  assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('ritmo-playlist-drag-handle'),{x:dragBox.x+18,y:dragBox.y+22}),true);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:dragBox.x+18,y:dragBox.y+22}]});
  await page.locator('.is-dragging').waitFor({state:'visible',timeout:2000});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:dragBox.x+18,y:840}]});
  await page.waitForTimeout(750);
  assert.ok(await page.evaluate(()=>document.querySelector('.ritmo-playlist-detail').scrollTop)>initialScroll+1);checks++;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.deepEqual((await state()).ids,before);checks++;
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
  }
  if(process.env.RITMO_SCREENSHOT) {
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>document.querySelector('.ritmo-playlist-detail').scrollTop=0);
    await page.screenshot({path:process.env.RITMO_SCREENSHOT});
  }
  // Network responses below are explicit fixtures, NOT proof of LRCLIB connectivity.
  let queries=[];
  let mode='results';
  let releaseOld;
  const oldReady=new Promise(resolve=>{releaseOld=resolve;});
  await page.route('https://lrclib.net/**',async route=>{
    const url=new URL(route.request().url());queries.push(url);
    if(url.searchParams.get('track_name')==='آهنگ 2') {
      await oldReady;
      await route.fulfill({contentType:'application/json',body:JSON.stringify({syncedLyrics:'[00:01]متن قدیمی'})}).catch(()=>{});
      return;
    }
    if(mode==='rate-limit')return route.fulfill({status:429,body:'{}'});
    if(url.searchParams.get('track_name')==='ترانه جستجو'&&url.pathname.endsWith('/get'))return route.fulfill({status:404,body:'{}'});
    if(url.pathname.endsWith('/search'))return route.fulfill({contentType:'application/json',body:JSON.stringify(
      mode==='empty'?[]:mode==='synced'?
        [{trackName:'ترانه جستجو',artistName:'خواننده',syncedLyrics:'[00:03]متن همگام جستجوی مجدد'}]:[
        {trackName:'ترانه جستجو (اجرای زنده)',artistName:'خواننده',plainLyrics:'متن نتیجه آنلاین آزمایشی'},
        {trackName:'ترانه جستجو (نسخه استودیویی)',artistName:'خواننده',plainLyrics:'متن جایگزین آزمایشی'},
      ],
    )});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({trackName:url.searchParams.get('track_name')||'آهنگ',artistName:url.searchParams.get('artist_name')||'خواننده آزمایشی',syncedLyrics:'[00:01]متن همگام آزمایشی'})});
  });
  await page.evaluate(()=>document.querySelector('#lyrics-fixture').click());
  await page.getByRole('button',{name:'متن ترانه',exact:true}).click();
  await page.getByRole('button',{name:'متن همگام آزمایشی',exact:true}).waitFor();
  assert.equal(queries.length,1);checks++;
  assert.equal(queries[0].searchParams.get('track_name'),'آهنگ 1');checks++;
  await page.getByRole('textbox',{name:'نام آهنگ'}).fill('ترانه جستجو');
  await page.getByRole('button',{name:'جست‌وجوی آنلاین',exact:true}).click();
  await page.locator('.skin-menu-lyrics-results button').first().click();
  await page.getByText('متن نتیجه آنلاین آزمایشی',{exact:true}).waitFor();checks++;
  const manualSearchRequests=queries.filter(url=>url.searchParams.get('track_name')==='ترانه جستجو'||url.searchParams.has('q'));
  assert.ok(manualSearchRequests.some(url=>url.pathname.endsWith('/get')
    && url.searchParams.get('track_name')==='ترانه جستجو'
    && url.searchParams.get('artist_name')==='خواننده'));checks++;
  assert.ok(manualSearchRequests.some(url=>url.searchParams.get('q')==='ترانه جستجو خواننده'));checks++;
  assert.ok(manualSearchRequests.some(url=>url.searchParams.get('q')==='ترانه جستجو'));checks++;
  mode='empty';
  await page.getByRole('button',{name:'جست‌وجوی آنلاین',exact:true}).click();
  await page.getByText('متنی برای این آهنگ پیدا نشد.',{exact:false}).waitFor();checks++;
  mode='rate-limit';
  await page.getByRole('button',{name:'جست‌وجوی آنلاین',exact:true}).click();
  await page.getByText('درخواست‌ها محدود شده‌اند؛ کمی بعد دوباره تلاش کنید.').waitFor();checks++;
  mode='synced';
  await page.getByRole('button',{name:'جست‌وجوی آنلاین',exact:true}).click();
  await page.getByText('متن همگام جستجوی مجدد',{exact:true}).waitFor();checks++;
  await page.getByRole('button',{name:'بستن',exact:true}).click();
  await page.locator('#change-song').click(); // second song will receive a deliberately delayed response
  await page.getByRole('button',{name:'متن ترانه',exact:true}).click();
  await page.getByText('در حال جست‌وجوی سرویس‌های متن ترانه…',{exact:true}).waitFor();
  await page.evaluate(()=>document.querySelector('#change-song').click()); // emulate external track transition
  releaseOld();
  await page.getByRole('button',{name:'متن ترانه',exact:true}).click();
  await page.getByRole('button',{name:'متن همگام آزمایشی',exact:true}).waitFor();
  assert.equal(await page.getByText('متن قدیمی',{exact:true}).count(),0);checks++;
  assert.deepEqual(errors,[]);checks++;
  console.log(JSON.stringify({checks,passed:true,scope:'Real Chromium component gestures with web-only native test double; no Android or production-build claim'}));
} finally {
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await rm(temporary,{recursive:true,force:true});
}
