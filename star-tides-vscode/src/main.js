import { World, clamp } from './world.js';
import { Renderer } from './renderer.js';
import { SoundEngine } from './audio.js';
import { PoseController } from './camera.js';
import { CONFIG } from './config.js';
import { STAGES, evolutionProgress } from './evolution.js';

const $ = id => document.getElementById(id);
const home = $('home-page'), play = $('play-page'), dialog = $('settings-dialog'), failure = $('failure-dialog');
const canvas = $('game-canvas'), homeRenderer = new Renderer($('home-canvas')), renderer = new Renderer(canvas);
const sound = new SoundEngine();
const world = new World(1280, 720, onGameEvent);
const keys = new Set();
let playing = false, paused = false, mode = 'practice', pointer = null;
let homePointer = { x: 0, y: 0 }, previousFrame = performance.now(), lastHud = 0, feedbackUntil = 0;

const pose = new PoseController($('camera-video'), $('pose-canvas'), onCameraState, action => {
  if (active()) action === 'split' ? world.split() : world.merge();
});

// 设置只保存在当前浏览器内；隐私模式不允许存储时仍可正常游玩。
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem('star-tides-preferences') || '{}'); } catch { /* 使用默认值 */ }
$('volume').value = clamp(Number(preferences.volume ?? 45), 0, 100);
$('quality').value = preferences.quality === 'low' ? 'low' : 'high';
$('reduced-motion').checked = preferences.reduced ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
applySettings(false);

function active() { return playing && !paused && !dialog.open && world.state!=='failed'; }
function focusGame() { if (playing && !dialog.open && !failure.open) canvas.focus({ preventScroll: true }); }
function message(text, duration = 3) { $('feedback').textContent = text; feedbackUntil = world.time + duration; }

function onGameEvent(event) {
  sound.play(event, world.width);
  if(event.type==='warning')message(`${event.direction}星球靠近 / ${event.name} · 留意航线`,2.5);
  if(event.type==='impact')message(`撞击 ${event.name} / ${event.loss ? '质量 −'+event.loss+'%' : '初始质量保护'} · 短暂护盾已开启`,3);
  if(event.type==='destroyed') {
    keys.clear();pointer=null;sound.update(0,false);
    message(`星体破碎 / 正被${event.name}吞噬`,5);
  }
  if(event.type==='failed') {
    keys.clear();pointer=null;sound.update(0,false);
    $('failure-score').textContent=event.score;
    $('failure-time').textContent=`${Math.floor(event.survived)} s`;
    $('failure-reason').textContent=`你的星球被更大的「${event.name}」吞噬了。下一次，留意四周的来袭提示。`;
    if(!failure.open)failure.showModal();
    $('retry-button').focus();
  }
  if (event.type === 'split') message(`星体破碎 / ${event.count} 块陨岩驶向深空`);
  if (event.type === 'merge') message('引力收束 / 碎石正在重新凝聚');
  if (event.type === 'evolve') message(`行星演化 / ${STAGES[event.stage].name} · ${STAGES[event.stage].subtitle}`, 6);
  if (event.type === 'pulse') message('引力震荡 / 星尘向深空扩散', 4);
  if (event.type === 'eat' && event.combo >= 3 && world.time > feedbackUntil) message(`连续吞噬 ×${event.combo} / 引力正在增强`, 1.5);
}

function resize() {
  if (playing) {
    renderer.resize(); world.resize(renderer.width, renderer.height); updateExclusion();
    renderer.render(world);
  } else homeRenderer.resize();
}
function updateExclusion() {
  const rect = $('camera-dock').getBoundingClientRect();
  world.exclusion = rect.width ? { left: rect.left, top: rect.top } : null;
}
new ResizeObserver(resize).observe(document.body);
new ResizeObserver(updateExclusion).observe($('camera-dock'));

function setPaused(value) {
  if(world.state==='failed')return;
  paused = value; keys.clear(); pointer = null;
  $('paused-overlay').hidden = !value;
  $('pause-button').setAttribute('aria-label', value ? '继续' : '暂停');
  $('pause-button').title = value ? '继续' : '暂停';
  sound.update(0, false);
  if (!value) focusGame();
}

function setMode(next) {
  mode = next; keys.clear(); pointer = null;
  play.dataset.mode = next;
  $('mode-label').textContent = next === 'camera' ? '体感模式' : '练习模式';
  $('practice-tab').classList.toggle('selected', next === 'practice');
  $('camera-tab').classList.toggle('selected', next === 'camera');
  $('practice-shortcut').hidden = next !== 'camera';
  $('move-hint').textContent = next === 'camera' ? '张开手臂分裂 · 缩拢身体合并 · 双手同向移动' : '拖动 / 方向键移动 · Shift 推进';
  if (next === 'practice') pose.stop();
  focusGame();
}

function enter() {
  playing = true; home.hidden = true; play.hidden = false;
  failure.close();resize(); world.reset(); setPaused(false); setMode('practice');
  message('吞噬小行星成长 · 留意从不同方向穿行的星球。', 5);
  updateHud(); renderer.render(world);
  sound.unlock(); focusGame();
}

function leave() {
  playing = false; keys.clear(); pointer = null; dialog.close();
  failure.close();pose.stop(); sound.update(0, false);
  play.hidden = true; home.hidden = false; homeRenderer.resize();
}

function route() {
  if (location.hash.startsWith('#play')) { if (!playing) enter(); }
  else if (playing) leave();
}
$('enter-button').onclick = () => { sound.unlock(); location.hash = 'play'; };
window.addEventListener('hashchange', route);
route();

function input() {
  if (mode === 'camera') return pose.direction;
  let x = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft') || keys.has('a'));
  let y = Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w'));
  if (pointer) {
    const center = world.center, distance = Math.hypot(pointer.x - center.x, pointer.y - center.y);
    if (distance > 8) { x = (pointer.x - center.x) / distance * Math.min(distance / 65, 1); y = (pointer.y - center.y) / distance * Math.min(distance / 65, 1); }
    else { x = 0; y = 0; }
  }
  return { x, y, boost: keys.has('shift') };
}

function updateHud() {
  $('score').textContent = String(world.score).padStart(3, '0');
  $('ball-count').textContent = String(world.state==='playing'?world.balls.length:0).padStart(2, '0');
  $('speed-value').textContent = String(Math.round(world.speed)).padStart(3, '0');
  $('combo-hud').hidden = world.combo < 2;
  $('combo-count').textContent = world.combo;
  $('combo-progress').style.transform = `scaleX(${clamp(1 - (world.time - world.lastEat) / CONFIG.gameplay.comboWindow, 0, 1)})`;
  const stage = STAGES[world.stage], progress = evolutionProgress(world.center.mass);
  $('stage-name').textContent = stage.name;
  $('stage-description').textContent = world.balls.length > 1 ? '陨岩形态 · 合并重塑行星' : stage.subtitle;
  $('evolution-label').textContent = world.stage < 2 ? `前往${STAGES[world.stage + 1].name}` : '终焉形态 · 持续吞噬';
  $('charge-count').textContent = `${Math.round(progress * 100)}%`;
  $('charge-fill').style.transform = `scaleX(${progress})`;
  play.style.setProperty('--stage-color', stage.color);
  if (mode === 'practice') {
    $('body-state').textContent = world.time < world.actionUntil ? (world.action === 'split' ? '星体破碎' : '行星重塑') : '身体待机';
    $('hands-state').textContent = world.speed > 10 ? '航行中' : '等待指引';
  }
  $('traffic-phase').textContent=world.threats.length?'星球穿行中':'平静星域';
  $('traffic-count').textContent=`附近星球 ${world.threats.length} · 注意航线`;
  $('traffic-status').dataset.phase=world.trafficPhase;
  if(world.time>feedbackUntil)$('feedback').textContent='星球从不同方向不规则穿行 / 沿轨迹判断方向，及时避让。';
}

function frame(now) {
  const dt = Math.min((now - previousFrame) / 1000, .05); previousFrame = now;
  if (!playing) homeRenderer.renderHome(now / 1000, homePointer);
  else if (active()) {
    if (mode === 'camera' && world.state==='playing') pose.update(now);
    const calibrating = mode === 'camera' && (!pose.ready || !pose.baseline);
    if (!calibrating) world.update(dt, input());
    renderer.render(world); sound.update(world.speed, !calibrating && world.state==='playing', world.center.mass, world.score);
    if (now - lastHud > 90) { updateHud(); lastHud = now; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function onCameraState(state) {
  if (state.message) $('camera-status').textContent = state.message;
  if (state.label) $('camera-state').textContent = state.label;
  if (state.body) $('body-state').textContent = state.body;
  if (state.hands) $('hands-state').textContent = state.hands;
  if ('hasVideo' in state) $('camera-placeholder').hidden = state.hasVideo;
  $('camera-start').innerHTML = `<svg><use href="#camera"/></svg><span>${pose?.busy ? '取消连接' : pose?.ready ? '关闭体感连接' : '开启体感连接'}</span>`;
  $('recalibrate').disabled = !pose?.ready;
  $('camera-dock').classList.toggle('connected', !!pose?.ready);
}

async function startCamera() {
  sound.unlock(); dialog.close(); setMode('camera');
  await pose.start();
}
$('camera-start').onclick = () => pose.ready || pose.busy ? setMode('practice') : startCamera();
$('practice-shortcut').onclick = () => setMode('practice');
$('camera-tab').onclick = startCamera;
$('practice-tab').onclick = () => setMode('practice');
$('recalibrate').onclick = () => { dialog.close(); pose.calibrate(); focusGame(); };
$('camera-collapse').onclick = () => {
  const content = $('camera-content'), hide = !content.hidden;
  content.hidden = hide;
  $('camera-collapse').textContent = hide ? '+' : '−';
  $('camera-collapse').setAttribute('aria-expanded', String(!hide));
  $('camera-collapse').setAttribute('aria-label', hide ? '展开摄像头预览' : '收起摄像头预览');
  updateExclusion(); focusGame();
};

$('help-button').onclick = () => { keys.clear(); pointer = null; sound.update(0, false); dialog.showModal(); };
$('close-settings').onclick = () => { dialog.close(); focusGame(); };
$('pause-button').onclick = () => setPaused(!paused);
$('resume-button').onclick = () => { sound.unlock(); setPaused(false); };
function restart() {
  failure.close();dialog.close();world.reset();keys.clear();pointer=null;
  setPaused(false);sound.unlock();message('星球重生 / 留意四周来袭的巨大星球。');updateHud();renderer.render(world);
}
$('reset-button').onclick=restart;
$('retry-button').onclick=restart;
$('failure-home').onclick=()=>{failure.close();location.hash='home';};
failure.addEventListener('cancel',event=>event.preventDefault());
$('sound-button').onclick = () => {
  sound.unlock(); sound.setMuted(!sound.muted);
  $('sound-button').classList.toggle('is-muted', sound.muted);
  $('sound-button').setAttribute('aria-pressed', String(!sound.muted));
  const title = sound.muted ? '开启音效' : '关闭音效';
  $('sound-button').setAttribute('aria-label', title); $('sound-button').title = title;
  focusGame();
};
document.querySelectorAll('[data-action]').forEach(button => {
  button.onclick = () => {
    if (!active()) return;
    sound.unlock(); button.dataset.action === 'split' ? world.split() : world.merge(); focusGame();
  };
});

function applySettings(save = true) {
  const volume = Number($('volume').value), quality = $('quality').value, reduced = $('reduced-motion').checked;
  sound.setVolume(volume / 100); $('volume-value').textContent = `${volume}%`;
  for (const target of [renderer, homeRenderer]) { target.quality = quality; target.reduced = reduced; target.resize(); }
  document.documentElement.classList.toggle('reduce-motion', reduced);
  if (save) try { localStorage.setItem('star-tides-preferences', JSON.stringify({ volume, quality, reduced })); } catch { /* 存储不可用 */ }
}
for (const id of ['volume', 'quality', 'reduced-motion']) $(id).addEventListener('input', () => applySettings());

// 键盘/触屏与体感共用同一个 World，确保两种模式的分合和吸收规则一致。
window.addEventListener('keydown', event => {
  if (!playing || world.state!=='playing' || dialog.open || event.target.matches('input,select,textarea')) return;
  const key = event.key.toLowerCase();
  if (key === 'escape') { event.preventDefault(); setPaused(!paused); return; }
  if (paused || mode !== 'practice') return;
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'm', 'w', 'a', 's', 'd', 'shift'].includes(key)) event.preventDefault();
  keys.add(key); sound.unlock();
  if (!event.repeat) { if (key === ' ') world.split(); if (key === 'm') world.merge(); }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); pointer = null; sound.update(0, false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) setPaused(true); });

function point(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
canvas.addEventListener('pointerdown', event => {
  if (!active() || world.state!=='playing' || mode !== 'practice') return;
  sound.unlock(); focusGame(); canvas.setPointerCapture(event.pointerId); pointer = point(event);
});
canvas.addEventListener('pointermove', event => { if (pointer) pointer = point(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { pointer = null; });
home.addEventListener('pointermove', event => { homePointer = { x: event.clientX / innerWidth * 2 - 1, y: event.clientY / innerHeight * 2 - 1 }; });
home.addEventListener('pointerleave', () => { homePointer = { x: 0, y: 0 }; });
window.addEventListener('pagehide', () => { pose.dispose(); sound.close(); });
