import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { CONFIG } from '../src/config.js';
import { collideFragments, mergeOffset, fragmentStyle } from '../src/fragments.js';
const advance=(w,time,input={},dt=1/60)=>{for(let i=0;i<Math.round(time/dt);i++)w.update(dt,input);};
function world(){let seed=19;const w=new World(1400,900,()=>{},()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;});w.foods=[];w.nextFood=w.nextThreat=Infinity;return w;}

test('unequal fragment collision conserves linear momentum and loses kinetic energy',()=>{
  const a={x:0,y:0,r:20,mass:300,vx:100,vy:12,phase:1,spin:0,pulse:0};
  const b={x:30,y:0,r:20,mass:600,vx:-70,vy:-9,phase:2,spin:0,pulse:0};
  const px=a.vx*a.mass+b.vx*b.mass,py=a.vy*a.mass+b.vy*b.mass;
  const energy=()=>a.mass*(a.vx**2+a.vy**2)+b.mass*(b.vx**2+b.vy**2),before=energy();
  assert.ok(collideFragments(a,b)>0);assert.ok(b.vx>a.vx);
  assert.ok(Math.abs(a.vx*a.mass+b.vx*b.mass-px)<1e-6);assert.equal(a.vy*a.mass+b.vy*b.mass,py);
  assert.ok(energy()<before);assert.ok(a.spin!==0&&b.spin!==0);
});

test('coincident fragments separate without NaN or perpetual artificial impulses',()=>{
  const a={x:10,y:10,r:20,mass:300,vx:0,vy:0,phase:0,spin:0,pulse:0};const b={...a};
  collideFragments(a,b);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>30);
  assert.equal(collideFragments(a,b),0);assert.ok(Number.isFinite(a.x+b.x));
});

test('steered swarm drifts independently yet follows input and remains bounded across frame rates',()=>{
  for(const dt of [1/30,1/60,1/120]) {
    const w=world();w.split();advance(w,1,{},dt);w.split();advance(w,1,{},dt);w.split();
    const original=w.center.x,relative=w.balls.map(b=>({x:b.x-w.center.x,y:b.y-w.center.y}));
    advance(w,1.2,{x:1,y:0},dt);assert.ok(w.center.x>original+70);
    assert.ok(w.balls.some((b,i)=>Math.hypot(b.x-w.center.x-relative[i].x,b.y-w.center.y-relative[i].y)>12));
    advance(w,10,{},dt);
    for(const b of w.balls){assert.ok(Number.isFinite(b.x+b.y));assert.ok(b.x>=0&&b.x<=w.width&&b.y>=0&&b.y<=w.height);assert.ok(Math.hypot(b.vx,b.vy)<CONFIG.fragments.maxSpeed+1);}
  }
});

test('fragment boundary impact reflects outward motion',()=>{
  const w=world();w.split();const b=w.balls[0];b.x=b.r+7;b.vx=-120;w.constrain(b);assert.ok(b.vx>0);
});

test('curved merge keeps starting tangent and arrives with zero relative velocity',()=>{
  const path={x:120,y:40,vx:80,vy:-20,curve:.65},duration=1.8,epsilon=1e-5;
  const a=mergeOffset(path,0,duration),b=mergeOffset(path,epsilon,duration),c=mergeOffset(path,1-epsilon,duration),end=mergeOffset(path,1,duration);
  assert.deepEqual(a,{x:120,y:40});assert.deepEqual(end,{x:0,y:0});
  assert.ok(Math.abs((b.x-a.x)/(epsilon*duration)-80)<.1);assert.ok(Math.hypot(c.x,c.y)/(epsilon*duration)<.1);
  const w=world();w.split();advance(w,.5,{x:1,y:0});const mass=w.center.mass;w.merge();
  advance(w,CONFIG.gameplay.mergeDuration-1/60);const near={...w.mergeAnchor};w.update(1/60);
  if(w.merging)w.update(1/60);
  assert.equal(w.balls.length,1);assert.ok(Math.hypot(w.balls[0].x-near.x,w.balls[0].y-near.y)<3);
  assert.ok(Math.abs(w.center.mass-mass)<1e-7);assert.equal(w.formation,1);
});

test('fragment palette transitions continuously through three distinct stages',()=>{
  const cold=fragmentStyle(0),warm=fragmentStyle(1),hot=fragmentStyle(2);
  assert.ok(cold.trail[2]>cold.trail[0]);assert.ok(warm.trail[0]>warm.trail[2]);assert.ok(hot.trail[1]<warm.trail[1]);
  const left=fragmentStyle(.999),right=fragmentStyle(1.001);
  assert.ok(left.trail.every((v,i)=>Math.abs(v-right.trail[i])<=1));
});
