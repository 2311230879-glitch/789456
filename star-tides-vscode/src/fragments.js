/** 碎片共用的阶段配色与碰撞规则，视觉和物理使用同一份定义。 */
export const FRAGMENT_STYLES = [
  { light: '#a8d1d9', mid: '#396e77', dark: '#102c42', crack: '#b7edf2', trail: [129,202,224], core: [221,247,247] },
  { light: '#ae8061', mid: '#5b392c', dark: '#201714', crack: '#ffb05e', trail: [226,139,69], core: [255,218,158] },
  { light: '#71433c', mid: '#2d2023', dark: '#100e15', crack: '#ff6740', trail: [245,77,42], core: [255,194,130] },
];
export const smoothstep = value => { const p=Math.max(0,Math.min(1,value));return p*p*(3-2*p); };
export function fragmentStyle(stage) {
  const s=Math.max(0,Math.min(2,stage)),lo=Math.min(1,Math.floor(s)),p=s-lo;
  const mix = key => FRAGMENT_STYLES[lo][key].map((v,i)=>Math.round(v+(FRAGMENT_STYLES[lo+1][key][i]-v)*p));
  const trail=mix('trail');
  return { trail,core:mix('core'),color:'#'+trail.map(v=>v.toString(16).padStart(2,'0')).join('') };
}

/** 质量加权接触修正 + 非完全弹性冲量；只有靠近中的碎片才反弹。 */
export function collideFragments(a,b,restitution=.72) {
  let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
  const minimum=(a.r+b.r)*.86;
  if(d>=minimum)return 0;
  if(d<.00001){const angle=a.phase*2.3+b.phase;dx=Math.cos(angle);dy=Math.sin(angle);d=1;}
  const nx=dx/d,ny=dy/d,wa=b.mass/(a.mass+b.mass),wb=1-wa;
  const overlap=Math.max(0,minimum-Math.hypot(b.x-a.x,b.y-a.y));
  a.x-=nx*overlap*wa;a.y-=ny*overlap*wa;b.x+=nx*overlap*wb;b.y+=ny*overlap*wb;
  const closing=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  if(closing>=0)return 0;
  const impulse=-(1+restitution)*closing;
  a.vx-=impulse*wa*nx;a.vy-=impulse*wa*ny;
  b.vx+=impulse*wb*nx;b.vy+=impulse*wb*ny;
  const tangent=(b.vx-a.vx)*-ny+(b.vy-a.vy)*nx;
  a.spin=Math.max(-2.8,Math.min(2.8,a.spin+tangent*.009));
  b.spin=Math.max(-2.8,Math.min(2.8,b.spin-tangent*.009));
  a.pulse=Math.max(a.pulse,.35);b.pulse=Math.max(b.pulse,.35);
  return -closing;
}

/** 起点位置和速度连续、终点相对速度为零的弧形收束。 */
export function mergeOffset(path,progress,duration) {
  const p=Math.max(0,Math.min(1,progress)),h00=2*p**3-3*p*p+1,h10=p**3-2*p*p+p;
  const bend=Math.sin(Math.PI*p)**2*(1-p)*path.curve;
  return {x:path.x*h00+path.vx*duration*h10-path.y*bend,
    y:path.y*h00+path.vy*duration*h10+path.x*bend};
}
