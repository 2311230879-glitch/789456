import { CONFIG } from './config.js';
import { ENCOUNTERS, sweptContact, encounterPath, APPROACH_LABELS } from './encounters.js';
import { collideFragments, mergeOffset, fragmentStyle } from './fragments.js';
import { stageForMass, radiusForMass, musicProfile } from './evolution.js';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 与 DOM 无关的游戏状态：移动、分裂、合并、吸收、连击和粒子生命周期。 */
export class World {
  constructor(width = 1280, height = 720, onEvent = () => {}, random = Math.random) {
    this.width = width;
    this.height = height;
    this.onEvent = onEvent;
    this.random = random;
    this.exclusion = null;
    this.reset();
  }

  rand(min, max) { return min + this.random() * (max - min); }

  makeBall(x, y, mass) {
    return { x, y, vx: 0, vy: 0, mass, r: radiusForMass(mass), phase: this.rand(0, 7), rotation: this.rand(0, 6.28), spin: this.rand(-.6, .6), driftRate: this.rand(.65, 1.3), pulse: 0, trail: [] };
  }

  reset() {
    this.time = 0;
    this.state = 'playing'; this.scroll = { x: 0, y: 0 };
    this.threats = []; this.death = null; this.nextFood = .3; this.nextThreat = CONFIG.space.firstThreat; this.threatSerial = 0; this.threatEdges = [];
    this.score = 0;
    this.combo = 0;
    this.lastEat = -100;
    this.lastSplit = -100;
    this.merging = false; this.mergeAnchor = null; this.lastClash = -100;
    this.speed = 0;
    this.thrust = 0;
    this.chargePulse = 0;
    this.action = 'neutral';
    this.trafficPhase = 'calm'; this.hitUntil = 0; this.hits = 0;
    this.stage = 0; this.visualStage = 0; this.formation = 1; this.impact = 0;
    this.actionUntil = 0;
    this.balls = [this.makeBall(this.width * 0.5, this.height * 0.5, 4096)];
    this.foods = [];
    this.particles = [];
    this.rings = [];
    this.labels = [];
    this.links = [];
    for (let i=0;i<7;i++) this.spawnFood(i*65);
  }

  resize(width, height) {
    const sx = width / this.width, sy = height / this.height;
    for (const entity of [...this.balls, ...this.foods, ...this.threats]) {
      entity.x *= sx;
      entity.y *= sy;
      if(entity.previousX!==undefined){entity.previousX=entity.x;entity.previousY=entity.y;}
      if (entity.trail) entity.trail = [];
      if (entity.mergePath) { entity.mergePath.x *= sx; entity.mergePath.y *= sy; entity.mergePath.vx *= sx; entity.mergePath.vy *= sy; }
    }
    if(this.death) for(const shard of this.death.shards){shard.originX*=sx;shard.originY*=sy;shard.x*=sx;shard.y*=sy;shard.vx*=sx;shard.vy*=sy;}
    if (this.mergeAnchor) {
      this.mergeAnchor.x *= sx; this.mergeAnchor.y *= sy;
      this.mergeAnchor.vx *= sx; this.mergeAnchor.vy *= sy;
    }
    this.width = width;
    this.height = height;
  }

  get center() {
    const mass = this.balls.reduce((sum, b) => sum + b.mass, 0);
    return { x: this.balls.reduce((sum, b) => sum + b.x * b.mass, 0) / mass,
      y: this.balls.reduce((sum, b) => sum + b.y * b.mass, 0) / mass, mass };
  }

  spawnFood(offset=0) {
    const food={x:this.width+24+Number(offset)+this.rand(0,45),y:this.rand(100,Math.max(101,this.height-60)),
      vx:-this.rand(76,125),vy:this.rand(-9,9),r:this.rand(8,17),type:Math.floor(this.rand(0,CONFIG.foodTypes.length)),phase:this.rand(0,7)};
    this.foods.push(food);
    return food;
  }

  get bodyRadius() { return Math.min(radiusForMass(this.center.mass),this.width*.18); }

  spawnThreat() {
    // 随机位置、尺寸、速度和入口；避免连着三颗都从同一边进入。
    const edges = ['left','right','top','bottom'];
    const previous = this.threatEdges;
    const choices = previous.length >= 2 && previous.at(-1) === previous.at(-2)
      ? edges.filter(edge => edge !== previous.at(-1)) : edges;
    const edge = choices[Math.floor(this.rand(0, choices.length))];
    previous.push(edge); if (previous.length > 2) previous.shift();
    const maxRadius = Math.max(32, Math.min(95 + this.tension*22, this.width*.18, this.height*.18));
    const r = this.rand(23, maxRadius);
    const threat = { ...encounterPath(this.width,this.height,r,edge,this.random), r,
      born:this.time, phase:this.rand(0,7), variant:Math.floor(this.rand(0,ENCOUNTERS.length)), trail:[] };
    threat.previousX=threat.x;threat.previousY=threat.y;
    this.threats.push(threat);this.threatSerial++;
    this.onEvent({type:'warning',name:ENCOUNTERS[threat.variant].name,direction:APPROACH_LABELS[edge],x:threat.x});
    return threat;
  }

  updateSpace(dt, spawn = true) {
    const mass = this.center.mass;
    const vx = this.balls.reduce((sum,b) => sum+b.vx*b.mass,0)/mass;
    const vy = this.balls.reduce((sum,b) => sum+b.vy*b.mass,0)/mass;
    this.scroll.x += (CONFIG.space.drift + vx*.35)*dt;
    this.scroll.y += vy*.25*dt;
    if (spawn) {
      if (this.time >= this.nextFood) {
        if (this.foods.length < CONFIG.space.maxAsteroids) this.spawnFood();
        this.nextFood = this.time + CONFIG.space.asteroidInterval;
      }
      if (this.time >= this.nextThreat) {
        if (this.threats.length < CONFIG.space.maxThreats) this.spawnThreat();
        this.nextThreat = this.time + this.rand(CONFIG.space.threatIntervalMin,CONFIG.space.threatIntervalMax);
      }
    }
    for (const planet of this.threats) {
      planet.previousX=planet.x;planet.previousY=planet.y;
      planet.x+=planet.vx*dt;planet.y+=planet.vy*dt;
      planet.trail.push({x:planet.x,y:planet.y});
      if (planet.trail.length>20) planet.trail.shift();
    }
    // 完整星环也离开屏幕后才回收；刚出生在屏幕外、正向内飞行的星球保留。
    this.threats=this.threats.filter(p=>{
      const margin=p.r*1.9+12;
      return !((p.x < -margin && p.vx<0)||(p.x>this.width+margin&&p.vx>0)||
        (p.y < -margin&&p.vy<0)||(p.y>this.height+margin&&p.vy>0));
    });
    this.trafficPhase=this.threats.length?'crossing':'calm';
  }

  collideThreats() {
    if (this.time < this.hitUntil) return;
    for (const planet of this.threats) {
      const body = this.balls.find(b => sweptContact(b,planet)) ||
        (this.merging && this.mergeProgress > .3 && sweptContact(this.mergeAnchor,planet) ? this.mergeAnchor : null);
      if (!body) continue;
      const before = this.center.mass;
      const loss = Math.min(before*CONFIG.hazards.loss, Math.max(0,before-4096));
      for (const b of this.balls) b.mass *= (before-loss)/before;
      // 合并中也能受击；沿整个群体施加冲量，合并曲线仍连续。
      const dx=body.x-planet.x,dy=body.y-planet.y,d=Math.hypot(dx,dy)||1;
      const nx=d===1&&dx===0?1:dx/d,ny=dy/d;
      if (this.merging) {this.mergeAnchor.vx+=nx*360;this.mergeAnchor.vy+=ny*360;}
      else for (const b of this.balls) {b.vx+=nx*360;b.vy+=ny*360;}
      this.hits++; this.hitUntil=this.time+CONFIG.hazards.immunity;this.impact=1;this.combo=0;
      this.burst(body.x,body.y,'#e9a37b',45,240);
      this.ring(body.x,body.y,body.r*2.5,'#e9a37b',.9);
      this.onEvent({type:'impact',x:body.x,loss:Math.round(loss/before*100),name:ENCOUNTERS[planet.variant].name});
      return;
    }
  }

  beginDefeat(predator) {
    if(this.state!=='playing')return false;
    this.state='dying';this.merging=false;this.mergeAnchor=null;this.links=[];this.combo=0;
    this.death={predator,started:this.time,score:this.score,survived:this.time,shards:[]};
    for(const ball of this.balls) for(let i=0;i<12;i++) {
      const a=this.rand(0,Math.PI*2),speed=this.rand(50,155),x=ball.x+Math.cos(a)*ball.r*.45,y=ball.y+Math.sin(a)*ball.r*.45;
      this.death.shards.push({x,y,originX:x,originY:y,vx:Math.cos(a)*speed+ball.vx*.2,vy:Math.sin(a)*speed+ball.vy*.2,
        r:this.rand(3,Math.max(5,ball.r*.22)),phase:this.rand(0,7),rotation:this.rand(0,6.28),spin:this.rand(-3,3),pulse:.5,alpha:1});
    }
    this.impact=1;this.onEvent({type:'destroyed',x:predator.x,name:ENCOUNTERS[predator.variant].name});return true;
  }

  updateDefeat(dt) {
    this.updateSpace(dt,false);
    const elapsed=this.time-this.death.started,p=clamp((elapsed-.38)/(CONFIG.space.defeatDuration-.38),0,1),pull=p*p*(3-2*p),target=this.death.predator;
    for(const shard of this.death.shards) {
      const blast=Math.min(elapsed,.5),curl=Math.sin(p*Math.PI)*35;
      shard.x=(shard.originX+shard.vx*blast)*(1-pull)+target.x*pull+Math.cos(shard.phase+p*5)*curl;
      shard.y=(shard.originY+shard.vy*blast)*(1-pull)+target.y*pull+Math.sin(shard.phase+p*5)*curl;
      shard.rotation+=shard.spin*dt;shard.alpha=1-p**3;
    }
    this.impact=Math.max(0,this.impact-dt*1.8);
    if(elapsed>=CONFIG.space.defeatDuration){this.state='failed';this.onEvent({type:'failed',x:target.x,score:this.death.score,survived:this.death.survived,name:ENCOUNTERS[target.variant].name});}
  }

  constrain(entity) {
    const r = Math.min(entity.r, Math.min(this.width, this.height) * .2);
    if (this.balls.length > 1 && entity.trail && !this.merging) {
      if (entity.x < r + 8 && entity.vx < 0 || entity.x > this.width-r-8 && entity.vx > 0) { entity.vx *= -.66; entity.spin *= -.8; }
      if (entity.y < r + 75 && entity.vy < 0 || entity.y > this.height-r-36 && entity.vy > 0) { entity.vy *= -.66; entity.spin *= -.8; }
    }
    entity.x = clamp(entity.x, r + 8, this.width - r - 8);
    entity.y = clamp(entity.y, r + 75, Math.max(r + 75, this.height - r - 36));
    // 摄像头预览是浮层；让能量球避开它，而不是被遮挡。
    if (this.exclusion) {
      const left = this.exclusion.left - r - 14, top = this.exclusion.top - r - 14;
      if (entity.x > left && entity.y > top) {
        if (entity.x - left < entity.y - top) { entity.x = left; entity.vx = -Math.abs(entity.vx) * .25; }
        else { entity.y = top; entity.vy = -Math.abs(entity.vy) * .25; }
      }
    }
  }

  burst(x, y, color, count = 28, speed = 160) {
    const remaining = CONFIG.particles.max - this.particles.length;
    for (let i = 0; i < Math.min(count, remaining); i++) {
      const angle = this.rand(0, Math.PI * 2), velocity = this.rand(speed * .2, speed);
      const life = this.rand(.35, .95);
      this.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
        life, maxLife: life, r: this.rand(.7, 2.6), color });
    }
  }

  ring(x, y, radius, color, duration = .7, inward = false) {
    this.rings.push({ x, y, radius, color, life: duration, duration, inward });
    if (this.rings.length > 36) this.rings.shift();
  }

  split() {
    if (this.state!=='playing' || this.merging || this.time - this.lastSplit < CONFIG.gameplay.splitCooldown) return false;
    if (this.balls.length >= CONFIG.gameplay.maxBalls) return false;
    this.lastSplit = this.time;
    let slots = CONFIG.gameplay.maxBalls - this.balls.length;
    this.balls = this.balls.flatMap(ball => {
      if (!slots) return [ball];
      slots--;
      const angle = this.rand(0, Math.PI * 2), fraction = this.rand(.43, .57);
      const color = fragmentStyle(this.visualStage).color;
      this.burst(ball.x, ball.y, color, 32, 160);
      const kick = this.rand(160, 225), gap = radiusForMass(ball.mass * fraction, true) + radiusForMass(ball.mass * (1-fraction), true);
      return [fraction, 1-fraction].map((portion, index) => {
        const sign = index === 0 ? -1 : 1, offset = gap * (1-portion) * .9;
        const child = this.makeBall(ball.x + Math.cos(angle)*offset*sign, ball.y + Math.sin(angle)*offset*sign, ball.mass*portion);
        child.vx = ball.vx + Math.cos(angle)*kick*sign*(1-portion);
        child.vy = ball.vy + Math.sin(angle)*kick*sign*(1-portion);
        child.r = radiusForMass(child.mass, true) * 1.07;
        child.spin = this.rand(-1.6,1.6); child.pulse = .7;
        this.constrain(child);
        return child;
      });
    });
    this.action = 'split'; this.actionUntil = this.time + .8;
    this.onEvent({ type: 'split', x: this.center.x, count: this.balls.length });
    return true;
  }

  merge() {
    if (this.state!=='playing' || this.merging || this.balls.length < 2) return false;
    this.merging = true; this.mergeStarted = this.time;
    this.action = 'merge'; this.actionUntil = this.time + CONFIG.gameplay.mergeDuration;
    const center = this.center;
    const vx=this.balls.reduce((sum,b)=>sum+b.vx*b.mass,0)/center.mass;
    const vy=this.balls.reduce((sum,b)=>sum+b.vy*b.mass,0)/center.mass;
    this.mergeAnchor={x:center.x,y:center.y,vx,vy,r:Math.min(radiusForMass(center.mass),this.width*.18)};
    for(const ball of this.balls) ball.mergePath={x:ball.x-center.x,y:ball.y-center.y,vx:ball.vx-vx,vy:ball.vy-vy,curve:this.rand(-.75,.75)};
    this.onEvent({ type: 'merge', x: center.x });
    return true;
  }

  eat(ball, food) {
    if(this.state!=='playing')return;
    this.combo = this.time - this.lastEat < CONFIG.gameplay.comboWindow ? this.combo + 1 : 1;
    this.lastEat = this.time;
    this.score++;
    ball.mass += food.r ** 2 * .75;
    ball.pulse = 1;
    const { color } = CONFIG.foodTypes[food.type];
    this.burst(food.x, food.y, color, 24 + Math.min(this.combo, 12), 145);
    this.ring(ball.x, ball.y, ball.r * 1.9, color, .55);
    this.labels.push({ x: food.x, y: food.y - 12, text: this.combo > 1 ? `连续吞噬 ×${this.combo}` : '+1 小行星', color, life: .9 });
    if (this.labels.length > 8) this.labels.shift();
    this.impact = Math.min(1, .25 + this.tension);
    this.onEvent({ type: 'eat', x: ball.x, foodType: food.type, combo: this.combo, tension: this.tension });
    if (this.score % CONFIG.gameplay.pulseEvery === 0) {
      this.chargePulse = 1;
      this.ring(ball.x, ball.y, Math.min(this.width, this.height) * .65, CONFIG.colors.cyan, 1.5);
      this.burst(ball.x, ball.y, CONFIG.colors.gold, 75, 330);
      this.onEvent({ type: 'pulse', x: ball.x });
    }
  }

  get mergeProgress() { return this.merging ? clamp((this.time-this.mergeStarted)/CONFIG.gameplay.mergeDuration,0,1) : 0; }

  get tension() { return musicProfile(this.center.mass, this.score).tension; }

  update(dt, input = { x: 0, y: 0, boost: false }) {
    dt = clamp(dt, 0, .05);
    if(this.state==='failed')return;
    this.time += dt;
    if(this.state==='dying'){this.updateDefeat(dt);return;}
    this.updateSpace(dt);
    this.impact = Math.max(0, this.impact - dt * 2.2);
    this.formation = Math.min(1, this.formation + dt * .9);
    const nextStage = stageForMass(this.center.mass);
    if (nextStage !== this.stage) {
      this.stage = nextStage;
      const c = this.center;
      this.ring(c.x, c.y, 260, nextStage === 1 ? '#edb47b' : '#ff754f', 2.3);
      this.onEvent({ type: 'evolve', stage: nextStage, x: c.x, tension: this.tension });
    }
    // 单独平滑材质与颜色；不会在阈值处瞬间换贴图。
    this.visualStage += (this.stage - this.visualStage) * Math.min(dt * .65, 1);
    let { x = 0, y = 0, boost = false } = input;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    this.thrust += ((magnitude > .05 ? 1 : 0) - this.thrust) * Math.min(dt * 6, 1);
    this.chargePulse = Math.max(0, this.chargePulse - dt);
    if (this.time - this.lastEat > CONFIG.gameplay.comboWindow) this.combo = 0;
    this.links = [];
    const center = this.center;
    const acceleration = CONFIG.movement.acceleration * (boost ? CONFIG.movement.boostMultiplier : 1);

    const fragmented=this.balls.length>1, tuning=CONFIG.fragments;
    const winds=this.balls.map(b=>({x:Math.sin(this.time*.83*b.driftRate+b.phase*3)*tuning.drift+Math.sin(this.time*1.31+b.phase)*28,
      y:Math.cos(this.time*.71*b.driftRate+b.phase*2.7)*tuning.drift+Math.sin(this.time*1.13+b.phase*5)*25}));
    const meanWind={x:winds.reduce((sum,w,i)=>sum+w.x*this.balls[i].mass,0)/center.mass,y:winds.reduce((sum,w,i)=>sum+w.y*this.balls[i].mass,0)/center.mass};
    if(this.merging) {
      const anchor=this.mergeAnchor,drag=Math.exp(-CONFIG.movement.drag*dt);
      anchor.vx=(anchor.vx+x*acceleration*dt)*drag; anchor.vy=(anchor.vy+y*acceleration*dt)*drag;
      anchor.x+=anchor.vx*dt;anchor.y+=anchor.vy*dt;
      anchor.r=Math.min(radiusForMass(center.mass),this.width*.18);
      // 在边缘合并时把凝聚中心缓缓移入安全区，避免整群突然跳位。
      const bounded={...anchor};this.constrain(bounded);
      anchor.x+=(bounded.x-anchor.x)*(1-Math.exp(-dt*5));
      anchor.y+=(bounded.y-anchor.y)*(1-Math.exp(-dt*5));
    }
    for (const [index,ball] of this.balls.entries()) {
      ball.previousX=ball.x;ball.previousY=ball.y;
      ball.r += (Math.min(radiusForMass(ball.mass, fragmented), this.width * .18) - ball.r) * (1-Math.exp(-dt*7));
      ball.pulse = Math.max(0, ball.pulse - dt * 2.5);
      ball.rotation+=ball.spin*dt;
      ball.spin+=(Math.sin(ball.phase*5)*.3-ball.spin)*(1-Math.exp(-dt*.4));
      if (this.merging) {
        const oldX=ball.x,oldY=ball.y,offset=mergeOffset(ball.mergePath,this.mergeProgress,CONFIG.gameplay.mergeDuration);
        ball.x=this.mergeAnchor.x+offset.x;ball.y=this.mergeAnchor.y+offset.y;
        ball.vx=dt?(ball.x-oldX)/dt:0;ball.vy=dt?(ball.y-oldY)/dt:0;
      } else {
        const steering=fragmented?.67:1;
        ball.vx+=x*acceleration*steering*dt;ball.vy+=y*acceleration*steering*dt;
        if(fragmented) {
          const dx=center.x-ball.x,dy=center.y-ball.y,d=Math.hypot(dx,dy),spring=tuning.cohesion*Math.max(0,1-55/Math.max(d,1));
          ball.vx+=(winds[index].x-meanWind.x+dx*spring)*dt;
          ball.vy+=(winds[index].y-meanWind.y+dy*spring)*dt;
        }
        const drag=Math.exp(-(fragmented?tuning.drag:CONFIG.movement.drag)*dt);
        ball.vx*=drag;ball.vy*=drag;
        const speed=Math.hypot(ball.vx,ball.vy);
        if(fragmented && speed>tuning.maxSpeed){ball.vx*=tuning.maxSpeed/speed;ball.vy*=tuning.maxSpeed/speed;}
        ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
        this.constrain(ball);
      }
      if (!ball.trail.length || distance(ball, ball.trail.at(-1)) > 2.5) {
        ball.trail.push({ x: ball.x, y: ball.y, age: 0 });
        if (ball.trail.length > CONFIG.particles.trailLength) ball.trail.shift();
      }
      for (const point of ball.trail) point.age += dt;
      ball.trail = ball.trail.filter(point => point.age < .85);
    }
    this.speed = this.balls.reduce((sum, ball) => sum + Math.hypot(ball.vx, ball.vy), 0) / this.balls.length;

    // 两次小规模接触求解，避免堆叠穿透；碰撞会交换动量并改变自转。
    if (!this.merging) for(let pass=0;pass<2;pass++) {
      for(let i=0;i<this.balls.length;i++) for(let j=i+1;j<this.balls.length;j++) {
        const a=this.balls[i],b=this.balls[j],impact=collideFragments(a,b,tuning.restitution);
        if(impact>24 && this.time-this.lastClash>.1) {
          this.lastClash=this.time;this.burst((a.x+b.x)/2,(a.y+b.y)/2,fragmentStyle(this.visualStage).color,8,40+impact*.25);
        }
      }
      for (const ball of this.balls) this.constrain(ball);
    }

    this.collideThreats();

    for (let i = this.foods.length - 1; i >= 0; i--) {
      const food = this.foods[i];
      food.x += food.vx * dt; food.y += food.vy * dt;
      if(food.x < -food.r-40 || food.y < -food.r-40 || food.y>this.height+food.r+40){this.foods.splice(i,1);continue;}
      if(food.x>this.width+food.r)continue;
      if(this.merging && this.mergeProgress>.55) continue;
      const nearest = this.balls.reduce((a, b) => distance(a, food) < distance(b, food) ? a : b);
      const d = distance(nearest, food);
      if (Math.sqrt(nearest.mass) <= food.r * 1.15) continue;
      if (d < nearest.r * .8 + food.r * .35) {
        this.eat(nearest, food); this.foods.splice(i, 1);
      } else if (d < nearest.r + CONFIG.particles.attractionRange) {
        const pull = Math.min(dt * (2 + (1 - d / (nearest.r + 72)) * 5), .2);
        food.x += (nearest.x - food.x) * pull;
        food.y += (nearest.y - food.y) * pull;
        this.links.push({ from: nearest, to: food, color: CONFIG.foodTypes[food.type].color });
      }
    }

    if (this.merging && this.time - this.mergeStarted >= CONFIG.gameplay.mergeDuration) {
      const merged = {...this.center,x:this.mergeAnchor.x,y:this.mergeAnchor.y};
      const ball = this.makeBall(merged.x, merged.y, merged.mass);
      ball.r = Math.min(radiusForMass(merged.mass), this.width * .18);
      ball.vx=this.mergeAnchor.vx;ball.vy=this.mergeAnchor.vy;
      ball.pulse = 0; this.constrain(ball);
      this.balls = [ball]; this.merging = false; this.formation = 1; this.mergeAnchor=null;
      this.onEvent({ type: 'formed', x: ball.x, tension: this.tension });
      this.burst(ball.x, ball.y, fragmentStyle(this.visualStage).color, 26, 85);
      this.ring(ball.x, ball.y, ball.r * 2, fragmentStyle(this.visualStage).color, 1.2);
    }
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-dt * 1.4); particle.vy *= Math.exp(-dt * 1.4);
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const ring of this.rings) ring.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
    for (const label of this.labels) { label.life -= dt; label.y -= 26 * dt; }
    this.labels = this.labels.filter(label => label.life > 0);
  }
}
