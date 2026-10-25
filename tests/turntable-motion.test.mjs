// Test the current production arm controller, not obsolete .vinyl-tonearm CSS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const skins=readFileSync(new URL('../src/components/PlayerSkins.tsx',import.meta.url),'utf8');
const begin=skins.indexOf('function ReferenceTurntable(');
const end=skins.indexOf('  return <div className="reference-turntable"',begin);
const code=stripTypeScriptTypes(skins.slice(begin,end)+'return null;\n}');
function harness(){
  const refs=[], effects=[], animations=[];
  let index=0, effectIndex=0;
  const element={
    style:{transform:'rotate(-42deg) translateY(-5px)'},dataset:{phase:'rest'},
    animate(frames,options){
      const anim={
        frames,options,playState:'running',onfinish:null,
        pause(){this.playState='paused';},play(){this.playState='running';},
        cancel(){this.playState='idle';},
      };
      animations.push(anim);return anim;
    },
  };
  const api=runInNewContext(code+'\nReferenceTurntable;',{
    useRef(value){return refs[index++]??(refs[index-1]={current:index===1?element:value});},
    useEffect(fn,deps){
      const i=effectIndex++,old=effects[i];
      if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j]))){
        old?.cleanup?.();effects[i]={deps,cleanup:fn()};
      }
    },
    getComputedStyle:el=>({transform:el.style.transform}),
    window:{matchMedia:()=>({matches:false})},
  });
  const render=(playing=false,trackId='a',armReset=0)=>{
    index=0;effectIndex=0;api({playing,trackId,armReset,artwork:null});
  };
  const latest=()=>animations.at(-1);
  const finish=()=>latest().onfinish?.();
  render();
  return{render,latest,finish,element,animations,dispose:()=>effects.forEach(e=>e.cleanup?.())};
}
test('same-track Play enters; Pause returns to rest; Resume enters again',()=>{
  const h=harness();assert.equal(h.animations.length,0);
  h.render(true);assert.equal(h.element.dataset.phase,'entering');
  const entering=h.latest();h.render(false);assert.equal(entering.playState,'idle');
  assert.equal(h.element.dataset.phase,'leaving');
  assert.equal(h.latest().frames.at(-1).transform,'rotate(-42deg) translateY(-5px)');
  h.finish();assert.equal(h.element.dataset.phase,'rest');
  h.render(true);assert.notEqual(h.latest(),entering);
  assert.equal(h.element.dataset.phase,'entering');
  h.finish();assert.equal(h.element.dataset.phase,'playing');
  h.render(false);assert.equal(h.element.dataset.phase,'leaving');
  h.finish();assert.equal(h.element.dataset.phase,'rest');
  h.dispose();
});
test('real reset prop lifts and returns to rest; next Play begins a new sweep',()=>{
  const h=harness();h.render(true);h.finish();
  h.render(false,'a',1);assert.equal(h.element.dataset.phase,'leaving');
  assert.equal(h.latest().frames.at(-1).transform,'rotate(-42deg) translateY(-5px)');
  h.finish();assert.equal(h.element.dataset.phase,'rest');
  h.render(true,'a',1);assert.equal(h.element.dataset.phase,'entering');
  h.dispose();assert.equal(h.latest().playState,'idle');
});
test('rapid track changes cancel stale motions and chain at completion, without timers',()=>{
  const h=harness();h.render(true);h.finish();
  h.render(true,'b');const outgoing=h.latest();
  h.render(true,'c');assert.equal(outgoing.playState,'idle');
  h.finish();assert.equal(h.element.dataset.phase,'entering');
  h.render(false,'c');assert.equal(h.element.dataset.phase,'leaving');
  h.render(true,'c');h.finish();assert.equal(h.element.dataset.phase,'entering');
  h.finish();assert.equal(h.element.dataset.phase,'playing');
  assert.doesNotMatch(code,/setTimeout|setInterval|requestAnimationFrame/);
  h.dispose();
});
test('Play during a Pause return waits for rest then enters; a second Pause prevents re-entry',()=>{
  const h=harness();h.render(true);h.finish();
  h.render(false);const returning=h.latest();
  h.render(true);assert.equal(h.latest(),returning);
  h.render(false);h.finish();assert.equal(h.element.dataset.phase,'rest');
  const count=h.animations.length;
  h.render(false);assert.equal(h.animations.length,count);
  h.render(true);assert.equal(h.element.dataset.phase,'entering');
  h.dispose();
});
