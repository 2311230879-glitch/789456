export const ENCOUNTERS = [
  { name: '砂金环星', kind: 'rings', color: '#ceb688', light: [213,193,153], dark: [91,73,52] },
  { name: '紫晶风暴星', kind: 'storm', color: '#bd9adc', light: [183,159,210], dark: [53,37,79] },
  { name: '苍白冰巨星', kind: 'ice', color: '#b5dfe0', light: [190,222,222], dark: [52,95,104] },
];

export const APPROACH_LABELS={left:'左侧',right:'右侧',top:'上方',bottom:'下方'};

/** 从选定边界外向场内随机一点航行；固定航向，不追踪玩家。 */
export function encounterPath(width,height,r,edge,random=Math.random) {
  const margin=r*1.85+70,range=(a,b)=>a+random()*(b-a);
  let x,y;
  if(edge==='left'||edge==='right') {x=edge==='left'?-margin:width+margin;y=range(height*.08,height*.92);}
  else {x=range(width*.08,width*.92);y=edge==='top'?-margin:height+margin;}
  const targetX=range(width*.12,width*.88),targetY=range(height*.12,height*.88);
  const dx=targetX-x,dy=targetY-y,length=Math.hypot(dx,dy),speed=range(48,108);
  return {x,y,vx:dx/length*speed,vy:dy/length*speed,edge};
}

/** 圆心运动线段到原点的最近距离，避免低帧率或高速移动时穿过星球。 */
export function sweptContact(body,planet) {
  const ax=(body.previousX??body.x)-(planet.previousX??planet.x);
  const ay=(body.previousY??body.y)-(planet.previousY??planet.y);
  const bx=body.x-planet.x,by=body.y-planet.y,dx=bx-ax,dy=by-ay;
  const length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)):0;
  return Math.hypot(ax+dx*t,ay+dy*t)<=body.r+planet.r;
}

/** 独立气态/冰态纹理，不复用主角的海陆与熔岩球面。 */
export function makeEncounterTexture(kind,size=320) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(size,size),style=ENCOUNTERS[kind];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const nx=(x+.5)/size*2-1,ny=(y+.5)/size*2-1,d=nx*nx+ny*ny;if(d>1)continue;
    const nz=Math.sqrt(1-d),u=Math.atan2(nx,nz),v=Math.asin(ny);
    const warp=Math.sin(u*7+Math.sin(v*9))* .11+Math.sin(u*19-v*14)*.027;
    let bands=.5+.24*Math.sin(v*(kind===2?12:32)+warp*16)+.12*Math.sin(v*91+u*8);
    if(kind===1) {
      const storm=Math.exp(-((nx+.3)**2*15+(ny-.2)**2*48));
      bands+=storm*Math.sin(Math.atan2(ny-.2,nx+.3)*3+Math.hypot(nx+.3,ny-.2)*55)*.28;
    }
    if(kind===2)bands=.45+.2*Math.sin(v*13+warp*4)+.13*Math.cos(u*9-v*15);
    bands=Math.max(0,Math.min(1,bands));
    const light=.12+Math.max(0,-nx*.50-ny*.33+nz*.65)*.96,edge=(1-nz)**5;
    const index=(y*size+x)*4;
    for(let k=0;k<3;k++)image.data[index+k]=(style.dark[k]+(style.light[k]-style.dark[k])*bands)*light+style.light[k]*edge*.17;
    image.data[index+3]=255;
  }
  ctx.putImageData(image,0,0);return canvas;
}

