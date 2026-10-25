import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureVerticalPositions, animateVerticalReorder } from '../src/utils/reorderMotion.ts';

const row=(key,top,animations=[])=>({dataset:{trackKey:key},getBoundingClientRect:()=>({top}),animate:(frames,options)=>animations.push({key,frames,options})});
test('FLIP capture and animation move only rows whose screen position changed',()=>{
  const animations=[];
  const first=row('a',10,animations), second=row('b',60,animations);
  const container={querySelectorAll:()=>[first,second]};
  const before=captureVerticalPositions(container,'[data-track-index]','trackKey');
  assert.deepEqual([...before], [['a',10],['b',60]]);
  const moved={querySelectorAll:()=>[row('b',10,animations),row('a',60,animations)]};
  animateVerticalReorder(moved,before,'[data-track-index]','trackKey');
  assert.equal(animations.length,2);
  assert.deepEqual(animations.map(a=>a.frames[0].transform), ['translateY(50px)','translateY(-50px)']);
  assert.ok(animations.every(a=>a.options.duration===220));
});

test('reduced motion and missing containers are safe no-ops',()=>{
  const old=globalThis.matchMedia;
  globalThis.matchMedia=()=>({matches:true});
  try { assert.deepEqual(captureVerticalPositions(null,'*','trackKey'),new Map()); animateVerticalReorder(null,new Map(),' * ','trackKey'); }
  finally { if(old===undefined) delete globalThis.matchMedia; else globalThis.matchMedia=old; }
});

test('all reorder surfaces use the shared FLIP helper and persist their existing order sources',()=>{
 const app=readFileSync(new URL('../src/RitmoAppClean.tsx',import.meta.url),'utf8');
 const playlist=readFileSync(new URL('../src/components/PlaylistDetail.tsx',import.meta.url),'utf8');
 assert.match(app,/captureVerticalPositions\(document\.querySelector\('\[data-song-list\]'\)/); assert.match(app,/animateVerticalReorder\(container/);
 // The component resolves listRef.current once, then uses that same DOM node
 // for its before/after FLIP measurements. Assert the behavior, not inline syntax.
 assert.match(playlist,/const rowContainer = listRef\.current/);
 assert.match(playlist,/before:\s*captureVerticalPositions\(rowContainer,\s*'\[data-track-index\]'/);
 assert.match(playlist,/animateVerticalReorder\(listRef\.current,\s*previousPositions\.current/);
 assert.match(app,/reorderVisibleSongs\(/); assert.match(app,/reorderPlaylistAt/);
});


test('library drag applies the moving offset to its live row and animated offsets to neighbors',()=>{
 const app=readFileSync(new URL('../src/RitmoAppClean.tsx',import.meta.url),'utf8');
 assert.match(app,/const sourceTransform=`translate3d\(0,\$\{distance\}px,0\) scale\(1\.025\)`/);
 assert.match(app,/if\(row\.style\.transform!==transform\) row\.style\.transform=transform/);
 assert.match(app,/classList\.toggle\('ritmo-manual-shift-up',inPath&&shift<0\)/);
 assert.match(app,/ritmo-song-drag-handle/);
});
