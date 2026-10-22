import { CONFIG } from './config.js';
import { ENCOUNTERS, makeEncounterTexture, APPROACH_LABELS } from './encounters.js';
import { FRAGMENT_STYLES, fragmentStyle, smoothstep } from './fragments.js';
import { PlanetSurface } from './surfaces.js';
const TAU = Math.PI * 2;
const mix = (a,b,t) => a + (b-a)*t;
const rand = n => { const v = Math.sin(n * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };

/** 写实宇宙：有昼夜面的球面材质、薄大气层、岩石碎片与尘埃。 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.quality = 'high'; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.width = 1; this.height = 1;
    this.surface = new PlanetSurface(360);
    this.encounterTextures=ENCOUNTERS.map((_,i)=>makeEncounterTexture(i));
    this.rockCache = Array.from({length:12}, (_,i) => this.makeRock(i));
    this.fragmentCache=FRAGMENT_STYLES.map((_,stage)=>Array.from({length:12},(_,i)=>this.makeRock(i,stage)));
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    this.width = rect.width; this.height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, this.quality === 'low' ? 1 : 2);
    this.canvas.width = Math.round(this.width*dpr); this.canvas.height = Math.round(this.height*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.backdrop = document.createElement('canvas'); this.backdrop.width = this.width; this.backdrop.height = this.height;
    const ctx = this.backdrop.getContext('2d'), w=this.width, h=this.height;
    ctx.fillStyle='#030509'; ctx.fillRect(0,0,w,h);
    // 淡薄尘云沿对角线延伸；固定噪声让场景稳定，避免每帧随机闪烁。
    ctx.globalCompositeOperation='screen';
    for(let i=0;i<85;i++) {
      const t=i/85, x=((w*(t*1.4-.2))%w+w)%w, y=h*(.85-t*.7)+(rand(i)*2-1)*h*.18;
      const r=w*(.075+rand(i+8)*.14);
      // 横向周期纹理：左右各画一份邻接尘云，循环滚动不会露出接缝。
      for(const shift of [-w,0,w]) {
        const cx=x+shift,g=ctx.createRadialGradient(cx,y,0,cx,y,r);
        g.addColorStop(0,i%3===0?'#65483810':'#3650680c');g.addColorStop(1,'#03050900');
        ctx.fillStyle=g;ctx.fillRect(cx-r,y-r,r*2,r*2);
      }
    }
    ctx.globalCompositeOperation='source-over';
  }
  background(time,center={x:this.width/2,y:this.height/2}, tension=0,scroll={x:time*12,y:0}) {
    const c=this.ctx,w=this.width,h=this.height;
    c.clearRect(0,0,w,h);
    const motion=this.reduced?.2:1,offset=((scroll.x*.12*motion)%w+w)%w;
    c.drawImage(this.backdrop,-offset,0,w,h);c.drawImage(this.backdrop,w-offset,0,w,h);
    const drift=this.reduced?0:time;
    for(let i=0;i<(this.quality==='low'?180:440);i++) {
      const depth=.2+rand(i+4)*.8, x=((rand(i+7)*w-scroll.x*depth*motion)%w+w)%w, y=((rand(i+811)*h-scroll.y*depth*motion)%h+h)%h;
      c.globalAlpha=(.13+depth*.55)*(.82+.18*Math.sin(drift*.8+i));
      c.fillStyle=i%5===0?'#e6c7a6':'#d2dde6'; const r=i%47===0?1.3:.35+depth*.45;
      c.beginPath(); c.arc(x,y,r,0,TAU); c.fill();
      if(i%83===0) this.glint(x,y,3+depth*2,.45);
    }
    c.globalAlpha=1;
    if(tension>.25) this.halo(w*.67,h*.46,w*.6,'#b94723',(tension-.25)*.12);
    // 远处的弥散星光，不使用网格或科技环。
    this.halo(w*.85,h*.11,75,'#bed3ea',.12);
  }
  halo(x,y,r,color,opacity=1) {
    const c=this.ctx; c.save(); c.globalAlpha*=opacity;
    const g=c.createRadialGradient(x,y,0,x,y,Math.max(.1,r));
    g.addColorStop(0,color+'80'); g.addColorStop(.35,color+'20'); g.addColorStop(1,color+'00');
    c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
  }
  glint(x,y,r,alpha=1,color='#f9e5c9') {
    const c=this.ctx; c.save(); c.globalAlpha*=alpha;c.strokeStyle=color;c.lineWidth=.7;
    c.beginPath();c.moveTo(x-r,y);c.lineTo(x+r,y);c.moveTo(x,y-r);c.lineTo(x,y+r);c.stroke();
    c.fillStyle='#fff6e5';c.beginPath();c.arc(x,y,1,0,TAU);c.fill();c.restore();
  }
  makeRock(seed,stage=null) {
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=100; const c=canvas.getContext('2d');
    c.translate(50,50); c.beginPath();
    for(let i=0;i<13;i++) {const a=i/12*TAU,r=32+rand((i%12)+seed*19)*13;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);} c.closePath();
    c.clip();const g=c.createLinearGradient(-40,-40,38,30);
    const material=stage===null?null:FRAGMENT_STYLES[stage];
    g.addColorStop(0,material?.light||'#aba494');g.addColorStop(.25,material?.mid||'#69665e');g.addColorStop(.6,material?.dark||'#34332f');g.addColorStop(1,'#090b0d');c.fillStyle=g;c.fillRect(-50,-50,100,100);
    for(let i=0;i<100;i++) {
      const x=(rand(i+seed*7)*2-1)*45,y=(rand(i+300+seed*11)*2-1)*45,r=1+rand(i+seed*3)*7;
      c.fillStyle=i%2?'#00000036':'#efe1c31b';c.beginPath();c.ellipse(x,y,r,r*.65,.4,0,TAU);c.fill();
      c.strokeStyle='#d6cbb528';c.lineWidth=.5;c.beginPath();c.arc(x,y,r,.9,3.8);c.stroke();
    }
    if(material) {
      // 每块岩石保留自己的裂隙轮廓，三个阶段只改变材质和裂隙热度。
      if(stage===0) for(let i=0;i<17;i++) {
        const x=rand(seed*31+i)*74-37,y=rand(seed*9+i+115)*74-37;
        c.fillStyle=i%3?'#d4e8df3a':'#42776788';c.beginPath();c.ellipse(x,y,4+rand(i)*8,2+rand(i+5)*3,i,0,TAU);c.fill();
      }
      c.strokeStyle=material.crack;c.lineWidth=stage===0?.65:stage===1?1.05:1.65;
      c.shadowColor=material.crack;c.shadowBlur=stage===0?2:stage===1?4:8;c.globalAlpha=stage===0?.48:.85;
      for(let branch=0;branch<5;branch++) {
        c.beginPath();let x=(rand(seed+branch*5)*2-1)*32,y=(rand(seed+branch*11)*2-1)*32;c.moveTo(x,y);
        for(let j=0;j<5;j++){x+=(rand(seed*11+branch*53+j)*2-1)*18;y+=8+rand(seed*7+j+branch)*7;c.lineTo(x,y);}c.stroke();
      }
    }
    return canvas;
  }
  drawRock(ball,time,owned=false,heat=0) {
    const c=this.ctx,r=ball.r,phase=ball.phase||0,angle=this.reduced?phase:(ball.rotation??time*.13+phase);
    const index=Math.floor(phase*17)%12,stage=Math.max(0,Math.min(2,heat)),lo=Math.min(1,Math.floor(stage)),blend=stage-lo;
    const style=fragmentStyle(stage),speed=Math.hypot(ball.vx||0,ball.vy||0),pulse=ball.pulse||0;
    c.save();c.translate(ball.x,ball.y);c.rotate(angle);
    if(owned) {
      c.drawImage(this.fragmentCache[lo][index],-r*1.1,-r*1.1,r*2.2,r*2.2);
      c.save();c.globalAlpha*=blend;c.drawImage(this.fragmentCache[lo+1][index],-r*1.1,-r*1.1,r*2.2,r*2.2);c.restore();
    } else c.drawImage(this.rockCache[index],-r*1.1,-r*1.1,r*2.2,r*2.2);
    c.restore();
    if(owned) {
      this.halo(ball.x-r*.3,ball.y-r*.3,r*(1.8+stage*.3),style.color,.13+stage*.08+pulse*.25);
      for(let i=0;i<3;i++) {
        const a=phase+i*2.1+(this.reduced?0:time*(.22+stage*.08)),blink=this.reduced?.24:Math.max(0,Math.sin(time*(1.5+stage*.4)+i*3+phase))**6;
        this.glint(ball.x+Math.cos(a)*r*1.16,ball.y+Math.sin(a)*r*1.16,2+blink*3,blink*.7,style.color);
      }
      if(!this.reduced&&speed>12&&stage>.05) {
        const nx=-(ball.vx||0)/speed,ny=-(ball.vy||0)/speed;
        for(let i=0;i<5;i++) {
          const q=(time*(.55+stage*.2)+i*.21+phase)%1;
          const travel=r+q*(15+speed*.17),side=Math.sin(i*7+phase)*r*.4*q;
          this.halo(ball.x+nx*travel-ny*side,ball.y+ny*travel+nx*side,(1-q)*2.5+.4,style.color,(1-q)*stage*.18);
        }
      }
    }
  }
  drawPlanet(ball,time,stage=0,thrust=0,formation=1) {
    const c=this.ctx, r=ball.r*(.7+.3*formation)*(1+ball.pulse*.025), t=this.reduced?0:time;
    const colors=[[130,189,221],[223,151,90],[251,105,59]], lo=Math.min(1,Math.floor(stage)), blend=stage-lo;
    const color='#'+colors[lo].map((v,i)=>Math.round(mix(v,colors[lo+1][i],blend)).toString(16).padStart(2,'0')).join('');
    const heat=Math.max(0,stage-1);
    this.halo(ball.x,ball.y,r*(1.5+heat*.35),color,.15+thrust*.13+heat*.18+ball.pulse*.15);
    // 暴烈阶段的冕焰：沿球缘逸散的物质，透明度缓慢呼吸。
    if(heat>.05) {
      c.save();c.globalCompositeOperation='screen';
      for(let i=0;i<(this.quality==='low'?15:34);i++) {
        const a=i*TAU/34+rand(i)*.2, flicker=this.reduced?.5:.5+.5*Math.sin(t*1.5+i*7);
        const length=r*(.06+rand(i+9)*.25)*heat;
        c.strokeStyle=`rgba(244,105,47,${heat*(.05+flicker*.12)})`;c.lineWidth=r*(.008+rand(i)*.012);
        c.shadowColor='#ec632c';c.shadowBlur=7;
        c.beginPath();c.moveTo(ball.x+Math.cos(a)*r*.96,ball.y+Math.sin(a)*r*.96);
        c.quadraticCurveTo(ball.x+Math.cos(a+.08)*(r+length),ball.y+Math.sin(a+.08)*(r+length),ball.x+Math.cos(a+.17)*r*1.01,ball.y+Math.sin(a+.17)*r*1.01);c.stroke();
      } c.restore();
      for(let i=0;i<16;i++) {
        const phase=this.reduced?.4:((t*.14+rand(i+16))%1),a=rand(i+58)*TAU;
        const radius=r*(1.08+phase*.5*heat);
        c.save();c.globalAlpha*=(1-phase)*heat*.6;
        this.drawRock({x:ball.x+Math.cos(a)*radius,y:ball.y+Math.sin(a)*radius,r:(1+rand(i)*3)*heat,phase:i},t);
        this.halo(ball.x+Math.cos(a)*radius,ball.y+Math.sin(a)*radius,5,'#ee854a',.25);c.restore();
      }
    }
    c.save();c.globalAlpha*=.55+.45*formation;
    c.drawImage(this.surface.draw(t,stage),ball.x-r,ball.y-r,r*2,r*2);
    // 极薄的大气边缘，亮面与暗面分离。
    const atmosphere=c.createRadialGradient(ball.x,ball.y,r*.94,ball.x,ball.y,r*1.045);
    atmosphere.addColorStop(0,color+'00');atmosphere.addColorStop(.62,color+(stage>.7?'44':'66'));atmosphere.addColorStop(1,color+'00');
    c.fillStyle=atmosphere;c.beginPath();c.arc(ball.x,ball.y,r*1.05,0,TAU);c.fill();c.restore();
    if(formation<1) {
      c.save();c.globalAlpha*=(1-formation)*.65;
      for(let i=0;i<18;i++) {const a=i*TAU/18+t*.3,rad=r*(1.05+(1-formation)*1.8);this.drawRock({x:ball.x+Math.cos(a)*rad,y:ball.y+Math.sin(a)*rad*.65,r:2+rand(i)*4,phase:i},t);}
      c.restore();
    }
  }
  drawEncounter(planet,time,danger=true) {
    const c=this.ctx,style=ENCOUNTERS[planet.variant],r=planet.r,x=planet.x,y=planet.y;
    const outside=x+r<0||x-r>this.width||y+r<0||y-r>this.height;
    const incoming=(x<0&&planet.vx>0)||(x>this.width&&planet.vx<0)||(y<0&&planet.vy>0)||(y>this.height&&planet.vy<0);
    if(outside) {
      if(incoming) {
        const side=planet.edge||(x<0?'left':x>this.width?'right':y<0?'top':'bottom');
        const px=side==='left'?22:side==='right'?this.width-22:Math.max(100,Math.min(this.width-180,x));
        const py=side==='top'?94:side==='bottom'?this.height-24:Math.max(120,Math.min(this.height-135,y));
        const angle={left:Math.PI,right:0,top:-Math.PI/2,bottom:Math.PI/2}[side];
        c.save();c.globalAlpha=.8;c.fillStyle=style.color;c.translate(px,py);c.rotate(angle);
        c.beginPath();c.moveTo(0,0);c.lineTo(-9,-5);c.lineTo(-9,5);c.fill();c.restore();
        c.save();c.font='10px Microsoft YaHei';c.fillStyle=style.color;c.globalAlpha=.8;
        c.textAlign=side==='left'?'left':side==='right'?'right':'center';
        c.fillText(danger?`巨星来袭 · ${APPROACH_LABELS[side]}`:'星体靠近',px+(side==='left'?15:side==='right'?-15:0),py+(side==='top'?19:side==='bottom'?-12:3));c.restore();
      }
      return;
    }
    this.halo(x,y,r*1.32,style.color,.10);
    const ring=(front)=>{
      c.save();c.translate(x,y);c.rotate(-.32);c.scale(1,.34);
      for(let i=0;i<8;i++) {
        c.strokeStyle=i%2?style.color+'45':style.color+'7a';c.lineWidth=r*.026;
        c.beginPath();c.arc(0,0,r*(1.32+i*.055),front?0:Math.PI,front?Math.PI:Math.PI*2);c.stroke();
      }c.restore();
    };
    if(style.kind==='rings')ring(false);
    c.save();c.translate(x,y);c.rotate(style.kind==='ice'?-.25:style.kind==='storm'?.18:0);
    c.drawImage(this.encounterTextures[planet.variant],-r,-r,r*2,r*2);c.restore();
    if(style.kind==='rings')ring(true);
    if(style.kind==='storm'&&!this.reduced) {
      const flash=Math.max(0,Math.sin(time*1.6+planet.phase))**16;
      this.halo(x-r*.22,y+r*.15,r*.35,'#dfcfff',flash*.20);
    }
    c.save();c.font='10px Microsoft YaHei';c.textAlign='center';c.fillStyle=style.color;
    c.globalAlpha=.75;c.fillText(style.name,x,y-r-18);
    c.font='9px Microsoft YaHei';c.globalAlpha=.65;c.fillText('穿行障碍 · 避让',x,y-r-5);c.restore();
  }

  drawTraffic(world) {
    const c=this.ctx;c.save();
    for(const planet of world.threats) {
      const color=ENCOUNTERS[planet.variant].color;
      if(!this.reduced) {
        c.globalAlpha=.10;c.strokeStyle=color;c.lineWidth=planet.r*.28;c.lineCap='round';
        c.beginPath();planet.trail.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
      }
      // 路径提示与实际速度同向，不指向画面中心。
      const speed=Math.hypot(planet.vx,planet.vy)||1,nx=planet.vx/speed,ny=planet.vy/speed;
      c.globalAlpha=.24;c.strokeStyle=color;c.lineWidth=.7;c.setLineDash([3,8]);
      c.beginPath();c.moveTo(planet.x+nx*planet.r,planet.y+ny*planet.r);
      c.lineTo(planet.x+nx*(planet.r+55),planet.y+ny*(planet.r+55));c.stroke();c.setLineDash([]);
    }
    c.restore();
  }

  drawDestruction(world) {
    const c=this.ctx,death=world.death;if(!death)return;
    const p=Math.min(1,(world.time-death.started)/CONFIG.space.defeatDuration);
    this.halo(death.predator.x,death.predator.y,death.predator.r*(1.1+Math.sin(p*Math.PI)*.4),ENCOUNTERS[death.predator.variant].color,Math.sin(p*Math.PI)*.3);
    for(const shard of death.shards) {
      c.save();c.globalAlpha=shard.alpha;
      this.drawRock({...shard,r:shard.r*(1-p*.8)},world.time,true,world.visualStage);c.restore();
    }
  }

  render(world) {
    const c=this.ctx,t=world.time,stage=world.visualStage,fragmented=world.balls.length>1;
    const style=fragmentStyle(stage),merge=world.mergeProgress,planetReveal=smoothstep((merge-.30)/.70),rockFade=1-smoothstep((merge-.40)/.55);
    this.background(t,world.center,world.tension,world.scroll);
    c.save();
    if(!this.reduced) c.translate(Math.sin(t*81)*world.impact*1.8,Math.cos(t*67)*world.impact*1.2);
    c.save();c.globalCompositeOperation='screen';
    if(!this.reduced&&world.state==='playing') for(const ball of world.balls) {
      const points=ball.trail;
      for(let i=1;i<points.length;i++) {
        const a=Math.max(0,1-points[i].age/.85)*i/points.length;
        c.strokeStyle=fragmented?`rgba(${style.trail.join(',')},${a*(.19+stage*.045)*rockFade})`:`rgba(${stage>1?'213,105,54':'149,180,199'},${a*.065})`;
        c.lineWidth=ball.r*(fragmented?.85:.9)*i/points.length;c.lineCap='round';
        c.beginPath();const prev=points[Math.max(0,i-2)];c.moveTo((prev.x+points[i-1].x)/2,(prev.y+points[i-1].y)/2);c.quadraticCurveTo(points[i-1].x,points[i-1].y,(points[i-1].x+points[i].x)/2,(points[i-1].y+points[i].y)/2);c.stroke();
        if(fragmented) {c.strokeStyle=`rgba(${style.core.join(',')},${a*.48*rockFade})`;c.lineWidth=1.5;c.stroke();}
      }
    }
    // 被捕获的小行星被引力撕成尘流，代替电弧连线。
    for(const link of world.links) for(let i=0;i<7;i++) {
      const f=((t*.75+i/7)%1), bend=Math.sin(f*Math.PI)*12;
      const x=mix(link.to.x,link.from.x,f)+bend,y=mix(link.to.y,link.from.y,f)-bend;
      c.globalAlpha=(1-f)*.5;c.fillStyle=link.color;c.beginPath();c.arc(x,y,1.3*(1-f)+.2,0,TAU);c.fill();
    }
    c.globalAlpha=1;c.restore();
    for(const food of world.foods) this.drawRock(food,t);
    this.drawTraffic(world);
    for(const planet of world.threats)this.drawEncounter(planet,t,true);
    if(world.state!=='playing'){this.drawDestruction(world);c.restore();return;}
    if(world.time < world.hitUntil) {
      c.save();c.strokeStyle='#e9c29d';c.globalAlpha=.22;c.lineWidth=1;
      for(const ball of world.balls){c.beginPath();c.arc(ball.x,ball.y,ball.r+9,0,TAU);c.stroke();}c.restore();
    }
    if(world.merging) {
      const anchor=world.mergeAnchor;
      c.save();c.globalAlpha*=planetReveal;
      this.drawPlanet({...anchor,phase:0,pulse:0},t,stage,world.thrust,planetReveal);
      c.restore();
      this.halo(anchor.x,anchor.y,anchor.r*(1.7+Math.sin(merge*Math.PI)*.5),style.color,Math.sin(merge*Math.PI)*.24);
    }
    for(const ball of world.balls) {
      if(fragmented) {
        c.save();c.globalAlpha*=rockFade;
        this.drawRock({...ball,r:ball.r*(1-.55*smoothstep((merge-.35)/.65))},t,true,stage);
        c.restore();
      } else this.drawPlanet(ball,t,stage,world.thrust,world.formation);
    }
    c.save();c.globalCompositeOperation='screen';
    for(const ring of world.rings) {
      const p=1-ring.life/ring.duration, r=Math.max(.1,ring.radius*(ring.inward?1-p:.2+p*.8));
      c.globalAlpha=Math.sin(p*Math.PI)*(this.reduced?.04:.10);c.strokeStyle=ring.color;c.lineWidth=1+(1-p)*4;
      c.shadowColor=ring.color;c.shadowBlur=12;
      c.beginPath();c.ellipse(ring.x,ring.y,r,r*.77,-.15,0,TAU);c.stroke();
    }
    c.shadowBlur=0;
    const stride=this.quality==='low'||this.reduced?3:1;
    for(let i=0;i<world.particles.length;i+=stride) {
      const p=world.particles[i];c.globalAlpha=p.life/p.maxLife;c.strokeStyle=p.color;c.lineWidth=p.r;
      c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.04,p.y-p.vy*.04);c.stroke();
    }c.restore();c.font='11px Microsoft YaHei, sans-serif';c.textAlign='center';
    for(const label of world.labels) {c.globalAlpha=Math.min(label.life*2,.8);c.fillStyle=label.color;c.fillText(label.text,label.x,label.y);}
    c.restore();
  }
  renderHome(time,pointer={x:0,y:0}) {
    this.background(time);
    const compact=this.width<700, x=this.width*(compact?.5:.71)+pointer.x*5,y=this.height*(compact?.3:.48)+pointer.y*5;
    const r=Math.min(this.height*.29,this.width*(compact?.27:.22));
    // 首页漫长的昼夜演化循环；进入游戏后永远从类地小行星开始。
    const cycle=this.reduced?0:(Math.sin(time*.075-Math.PI/2)+1);
    this.drawPlanet({x,y,r,phase:0,pulse:0},time,cycle,0,1);
    for(let i=0;i<24;i++) {
      const a=i*TAU/24+(this.reduced?0:time*.015),rad=r*(1.5+rand(i)*.7);
      this.drawRock({x:x+Math.cos(a)*rad,y:y+Math.sin(a)*rad*.43,r:2+rand(i+3)*7,phase:i},time);
    }
  }
}
