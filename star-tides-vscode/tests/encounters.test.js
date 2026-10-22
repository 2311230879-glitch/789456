import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { CONFIG } from '../src/config.js';
import { encounterPath, sweptContact } from '../src/encounters.js';
const advance=(w,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)w.update(1/60);};
function fixture(){const events=[];let seed=123;const w=new World(1280,800,e=>events.push(e),()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;});w.foods=[];w.nextFood=w.nextThreat=Infinity;return {w,events};}
function contact(w) {const b=w.balls[0];w.threats=[{x:b.x,y:b.y,previousX:b.x,previousY:b.y,r:45,variant:0}];}

test('all four entry routes cross the viewport then fully exit with constant heading',()=>{
  for(const edge of ['left','right','top','bottom'])for(const sample of [.02,.3,.6,.98]){
    const r=50,p=encounterPath(1280,800,r,edge,()=>sample);
    assert.ok(p.x+r<0||p.x-r>1280||p.y+r<0||p.y-r>800);
    let entered=false,exited=false;
    for(let t=0;t<100;t+=.1){
      const x=p.x+p.vx*t,y=p.y+p.vy*t;
      if(x>0&&x<1280&&y>0&&y<800)entered=true;
      if(entered&&(x+r*1.9<0||x-r*1.9>1280||y+r*1.9<0||y-r*1.9>800))exited=true;
    }
    assert.ok(entered&&exited,edge);
  }
});

test('spawns vary in edge, size, speed, position and timing instead of synchronized waves',()=>{
  const {w,events}=fixture();w.nextThreat=0;const spawned=[],intervals=[];
  for(let i=0;i<40;i++){
    w.time=w.nextThreat;w.threats=[];w.updateSpace(0);
    const p=w.threats[0];spawned.push(p);intervals.push(w.nextThreat-w.time);
    assert.equal(w.threats.length,1);assert.ok(intervals.at(-1)>=CONFIG.space.threatIntervalMin&&intervals.at(-1)<=CONFIG.space.threatIntervalMax);
  }
  assert.equal(new Set(spawned.map(p=>p.edge)).size,4);
  for(const values of [spawned.map(p=>Math.round(p.r)),spawned.map(p=>Math.round(Math.hypot(p.vx,p.vy))),intervals.map(n=>n.toFixed(2))])assert.ok(new Set(values).size>8);
  assert.equal(events.filter(e=>e.type==='warning').length,40);
  for(let i=2;i<spawned.length;i++)assert.ok(!(spawned[i].edge===spawned[i-1].edge&&spawned[i].edge===spawned[i-2].edge));
});

test('incoming planets survive offscreen; outgoing planets are removed at every edge',()=>{
  for(const edge of ['left','right','top','bottom']){
    const {w}=fixture();const p={...encounterPath(w.width,w.height,45,edge,()=>.4),r:45,variant:0,trail:[]};
    w.threats=[p];w.updateSpace(.05,false);assert.equal(w.threats.length,1);
    for(let i=0;i<2200;i++)w.updateSpace(.05,false);
    assert.equal(w.threats.length,0,edge);
  }
});

test('collision applies one 7 percent mass loss, knockback and immunity without resetting growth',()=>{
  const {w,events}=fixture();w.balls[0].mass=10000;w.score=45;contact(w);
  w.collideThreats();assert.equal(w.center.mass,9300);assert.equal(w.score,45);
  assert.ok(Math.hypot(w.balls[0].vx,w.balls[0].vy)>100);
  w.collideThreats();assert.equal(w.center.mass,9300);assert.equal(events.filter(e=>e.type==='impact').length,1);
  w.time+=CONFIG.hazards.immunity+.01;contact(w);w.collideThreats();assert.equal(w.center.mass,8649);
  assert.equal(w.state,'playing');
});

test('collision floor prevents initial planet from disappearing; reset clears traffic state',()=>{
  const {w}=fixture();for(let i=0;i<30;i++){contact(w);w.collideThreats();w.time+=2;}
  assert.equal(w.center.mass,4096);assert.ok(w.hits>0);
  w.reset();assert.equal(w.hits,0);assert.equal(w.hitUntil,0);assert.equal(w.trafficPhase,'calm');assert.equal(w.threats.length,0);
});

test('fragment and merge contact remain vulnerable and loss preserves proportional fragment masses',()=>{
  for(const merge of [false,true]){
    const {w}=fixture();w.balls[0].mass=10000;w.split();advance(w,.3);
    if(merge){w.merge();advance(w,.65);}
    const shares=w.balls.map(b=>b.mass/w.center.mass);contact(w);w.collideThreats();
    assert.ok(Math.abs(w.center.mass-9300)<1e-8);
    w.balls.forEach((b,i)=>assert.ok(Math.abs(b.mass/w.center.mass-shares[i])<1e-10));
  }
});

test('solid-body swept contact catches tunnelling and excludes decorative ring space',()=>{
  const planet={previousX:250,previousY:100,x:250,y:100,r:80};
  assert.equal(sweptContact({previousX:0,previousY:100,x:500,y:100,r:10},planet),true);
  assert.equal(sweptContact({previousX:0,previousY:205,x:500,y:205,r:10},planet),false);
});

test('background moves at rest and long-running crossing objects stay bounded',()=>{
  const {w}=fixture();advance(w,1);assert.ok(w.scroll.x>0);
  w.nextThreat=0;w.nextFood=0;
  for(let i=0;i<12000;i++){w.time+=.05;w.updateSpace(.05);assert.ok(w.threats.length<=CONFIG.space.maxThreats);}
  assert.ok(w.foods.length<=CONFIG.space.maxAsteroids);
});
