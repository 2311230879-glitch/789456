import test from 'node:test';
import assert from 'node:assert/strict';
import { readGesture } from '../src/gestures.js';
test('pose separates body shape from hand direction and rejects lost landmarks', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  const put = (i, x, y) => { points[i] = { x, y, visibility: 1 }; };
  put(11, .4, .35); put(12, .6, .35); put(13, .3, .4); put(14, .7, .4); put(15, .18, .35); put(16, .82, .35);
  assert.equal(readGesture(points).body, 'split'); assert.equal(readGesture(points).x, 0);
  put(15, .7, .5); put(16, .82, .5);
  assert.equal(readGesture(points).body, 'neutral'); assert.equal(readGesture(points).x, 1);
  points[15].visibility = .1; assert.equal(readGesture(points).tracked, false);
});
