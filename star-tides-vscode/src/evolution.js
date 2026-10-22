/** 总质量决定行星阶段；分裂只改变形态，不会清空成长进度。 */
export const STAGES = [
  { name: '蔚蓝新生', subtitle: '海洋 · 大陆 · 云层', color: '#92c8e1', mass: 4096 },
  { name: '熔火失衡', subtitle: '干涸 · 风暴 · 熔岩', color: '#e5ad75', mass: 6800 },
  { name: '终焉湮灭', subtitle: '裂解 · 日冕 · 崩塌', color: '#ff6e46', mass: 11500 },
];
const limit = n => Math.max(0, Math.min(1, n));
export function stageForMass(mass) { return mass >= STAGES[2].mass ? 2 : mass >= STAGES[1].mass ? 1 : 0; }
export function radiusForMass(mass, fragmented = false) {
  return fragmented ? Math.max(15, Math.min(37, Math.sqrt(mass) * .51)) : Math.min(132, 56 * Math.sqrt(mass / 4096));
}
export function evolutionProgress(mass) {
  const stage = stageForMass(mass);
  return stage === 2 ? 1 : limit((mass - STAGES[stage].mass) / (STAGES[stage + 1].mass - STAGES[stage].mass));
}
// 两个因素都只会增加紧张度：总质量，以及本局吞噬数量。分裂不会让配乐降档。
export function musicProfile(mass = 4096, score = 0) {
  const tension = limit(.64 * limit((mass - 4096) / 10500) + .36 * limit(score / 90));
  return { tension, bpm: 58 + tension * 88, bass: 48 - tension * 20,
    impactDuration: .32 + tension * .72, impactGain: .16 + tension * .16 };
}
