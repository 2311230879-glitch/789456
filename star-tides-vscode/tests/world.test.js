import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { CONFIG } from '../src/config.js';

function fixture() {
  let seed = 7821;
  const events = [], random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const world = new World(1000, 700, event => events.push(event), random);
  world.foods = []; world.nextFood=world.nextThreat=Infinity;
  return { world, events };
}
function advance(world, seconds, input = {}) { for (let i = 0; i < Math.ceil(seconds * 60); i++) world.update(1 / 60, input); }

test('split is bounded, cooldown protected and conserves mass', () => {
  const { world } = fixture(), mass = world.center.mass;
  assert.equal(world.split(), true); assert.equal(world.balls.length, 2);
  assert.equal(world.split(), false);
  advance(world, 1); world.split(); advance(world, 1); world.split();
  assert.equal(world.balls.length, CONFIG.gameplay.maxBalls);
  advance(world, 1); assert.equal(world.split(), false);
  assert.ok(Math.abs(world.center.mass - mass) < 1e-6);
  assert.notEqual(world.balls[0].trail, world.balls[1].trail);
});

test('merge actually reaches a single core with preserved mass', () => {
  const { world } = fixture(), mass = world.center.mass;
  world.split(); advance(world, .3); assert.equal(world.merge(), true);
  advance(world, CONFIG.gameplay.mergeDuration + .05);
  assert.equal(world.merging, false); assert.equal(world.balls.length, 1);
  assert.ok(Math.abs(world.center.mass - mass) < 1e-6);
});

test('motion produces trails and boost increases speed', () => {
  const normal = fixture().world, boost = fixture().world;
  advance(normal, .6, { x: 1, y: 0 }); advance(boost, .6, { x: 1, y: 0, boost: true });
  assert.ok(normal.balls[0].x > 500); assert.ok(normal.balls[0].trail.length > 3);
  assert.ok(boost.speed > normal.speed * 1.5);
  advance(normal, 2); assert.ok(normal.speed < 1);
});

test('absorption grows mass, counts once, chains, and emits every tenth pulse', () => {
  const { world, events } = fixture(), startingMass = world.center.mass;
  for (let i = 0; i < 10; i++) {
    const ball = world.balls[0];
    world.foods = [{ x: ball.x, y: ball.y, vx: 0, vy: 0, r: 10, phase: 0, type: i % 3 }];
    world.update(1 / 60);
  }
  assert.equal(world.score, 10); assert.equal(world.combo, 10);
  assert.equal(world.center.mass, startingMass + 750);
  assert.equal(events.filter(e => e.type === 'eat').length, 10);
  assert.equal(events.filter(e => e.type === 'pulse').length, 1);
  world.foods = []; world.nextFood=world.nextThreat=Infinity; advance(world, 3); assert.equal(world.combo, 0);
});

test('small food is attracted, larger food is not swallowed', () => {
  const { world } = fixture(), ball = world.balls[0];
  const food = { x: ball.x + ball.r + 30, y: ball.y, r: 10, vx: 0, vy: 0, phase: 0, type: 0 };
  const originalX = food.x; world.foods = [food]; world.update(.016);
  assert.ok(food.x < originalX); assert.equal(world.links.length, 1);
  world.foods = [{ ...food, x: ball.x, y: ball.y, r: ball.r * 1.3 }];
  world.update(.016); assert.equal(world.score, 0);
});

test('camera exclusion keeps the core visible; reset clears effects and score', () => {
  const { world } = fixture(); world.exclusion = { left: 780, top: 440 };
  world.balls[0].x = 850; world.balls[0].y = 550; world.update(.016);
  const ball = world.balls[0]; assert.ok(ball.x <= 780 - ball.r || ball.y <= 440 - ball.r);
  world.score = 15; world.split(); world.reset();
  assert.equal(world.score, 0); assert.equal(world.balls.length, 1);
  assert.equal(world.particles.length, 0); assert.equal(world.rings.length, 0);
});

test('effect budget remains bounded', () => {
  const { world } = fixture();
  for (let i = 0; i < 100; i++) world.burst(100, 100, '#ffffff', 50);
  assert.equal(world.particles.length, CONFIG.particles.max);
  advance(world, 2); assert.equal(world.particles.length, 0);
});

