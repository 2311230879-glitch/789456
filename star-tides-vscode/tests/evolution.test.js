import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { World } from '../src/world.js';
import { STAGES, stageForMass, radiusForMass, musicProfile } from '../src/evolution.js';
const advance = (w, seconds) => { for (let i=0;i<seconds*60;i++) w.update(1/60); };

test('actual consumption reaches all three stages and interpolates the material', () => {
  const events=[],w=new World(1280,800,e=>events.push(e));w.foods=[];w.nextFood=w.nextThreat=Infinity;
  assert.equal(w.stage,0);const startR=w.balls[0].r;
  while(w.center.mass<STAGES[1].mass) w.eat(w.balls[0],{x:640,y:400,r:16,type:0});
  w.update(1/60);assert.equal(w.stage,1);assert.ok(w.visualStage>0&&w.visualStage<.03);
  advance(w,8);assert.ok(w.visualStage>.99);assert.ok(w.balls[0].r>startR);
  while(w.center.mass<STAGES[2].mass) w.eat(w.balls[0],{x:640,y:400,r:16,type:2});
  w.update(1/60);assert.equal(w.stage,2);assert.ok(w.visualStage<1.1);
  advance(w,8);assert.ok(w.visualStage>1.99);
  assert.deepEqual(events.filter(e=>e.type==='evolve').map(e=>e.stage),[1,2]);
});

test('fragmentation and recombination preserve stage and musical intensity at every size', () => {
  for(const stage of STAGES) {
    const w=new World();w.foods=[];w.nextFood=w.nextThreat=Infinity;w.balls[0].mass=stage.mass;w.update(.016);
    const mass=w.center.mass,intensity=w.tension;
    assert.equal(w.split(),true);advance(w,.2);
    assert.ok(Math.abs(w.tension-intensity)<1e-10);assert.ok(w.balls.every(b=>b.r<radiusForMass(mass)));
    w.merge();advance(w,CONFIG.gameplay.mergeDuration+.05);assert.equal(w.balls.length,1);assert.ok(Math.abs(w.center.mass-mass)<1e-8);
    assert.equal(w.stage,stageForMass(mass));assert.equal(w.formation,1);
    advance(w,2);assert.equal(w.formation,1);
  }
});

test('mass and swallowed count independently raise tempo and deepen impacts; values bounded', () => {
  const quiet=musicProfile(4096,0),heavy=musicProfile(13000,0),many=musicProfile(4096,90),max=musicProfile(1e9,1e6);
  for(const louder of [heavy,many,max]) {
    assert.ok(louder.bpm>quiet.bpm);assert.ok(louder.bass<quiet.bass);
    assert.ok(louder.impactDuration>quiet.impactDuration);assert.ok(louder.impactGain>quiet.impactGain);
  }
  assert.equal(max.tension,1);assert.equal(max.bpm,146);
});

test('reset restores blue planet, low intensity and clears transition', () => {
  const w=new World();w.balls[0].mass=14000;w.score=90;advance(w,4);w.split();w.reset();
  assert.equal(w.stage,0);assert.equal(w.visualStage,0);assert.equal(w.tension,0);assert.equal(w.formation,1);
});
