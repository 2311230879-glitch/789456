/** 想调手感、颜色和特效？优先修改这个文件，保存后预览会自动刷新。 */
export const CONFIG = {
  movement: { acceleration: 820, drag: 4.1, boostMultiplier: 1.7 },
  particles: { max: 650, trailLength: 34, attractionRange: 72 },
  gameplay: { maxBalls: 8, splitCooldown: 0.8, mergeDuration: 1.8, comboWindow: 2.5, pulseEvery: 10 },
  fragments: { drift: 76, drag: 2.3, cohesion: 1.25, restitution: .72, maxSpeed: 470 },
  space: { drift: 32, asteroidInterval: .48, firstThreat: 3, threatIntervalMin: 1.8, threatIntervalMax: 4.6, maxAsteroids: 60, maxThreats: 9, defeatDuration: 2.4 },
  hazards: { loss: .07, immunity: 1.6 },
  colors: { cyan: '#c4d7e3', violet: '#e6ac78', gold: '#ff9e64', background: '#030509' },
  foodTypes: [
    { name: '冰岩', color: '#b0c9d7', frequency: 440 },
    { name: '陨铁', color: '#ac9d8c', frequency: 554.37 },
    { name: '炽岩', color: '#e4a370', frequency: 659.25 },
  ],
};
