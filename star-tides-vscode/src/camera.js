import { readGesture } from './gestures.js';

/** MediaPipe 上半身体感：独立模块，摄像头帧永不离开本机。 */
export class PoseController {
  constructor(video, canvas, onState, onAction) {
    this.video = video; this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.onState = onState; this.onAction = onAction;
    this.token = 0; this.ready = false; this.busy = false; this.model = null;
    this.direction = { x: 0, y: 0 }; this.calibrate(false);
  }

  status(message, label = 'WAITING', extra = {}) { this.onState({ message, label, ...extra }); }

  async loadModel(token) {
    if (this.model) return;
    const version = '0.10.21';
    const bases = [`https://registry.npmmirror.com/@mediapipe/tasks-vision/${version}/files`, `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}`];
    for (const base of bases) {
      if (token !== this.token) return;
      try {
        const vision = await bounded(import(`${base}/vision_bundle.mjs`), 18000);
        const files = await bounded(vision.FilesetResolver.forVisionTasks(`${base}/wasm`), 18000);
        for (const delegate of ['GPU', 'CPU']) {
          if (token !== this.token) return;
          try {
            const model = await vision.PoseLandmarker.createFromOptions(files, {
              baseOptions: { modelAssetPath: new URL('../assets/pose_landmarker_lite.task', import.meta.url).href, delegate },
              runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .55, minTrackingConfidence: .55,
            });
            if (token !== this.token) { model.close(); return; }
            this.model = model; return;
          } catch { /* GPU 不支持时自动尝试 CPU。 */ }
        }
      } catch { /* 尝试备用 CDN。 */ }
    }
    throw new Error('Model unavailable');
  }

  async start() {
    if (this.ready || this.busy) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.status('摄像头需要 localhost 或 HTTPS；可先使用练习模式。', 'UNAVAILABLE'); return;
    }
    const token = ++this.token; this.busy = true;
    this.status('请允许摄像头访问，画面仅在本机处理。', 'CONNECTING', { busy: true });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      if (token !== this.token) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream; this.video.srcObject = stream; await this.video.play();
      if (token !== this.token) return;
      this.status('正在加载识别组件，首次连接可能需要一些时间。', 'LOADING', { busy: true, hasVideo: true });
      await this.loadModel(token);
      if (token !== this.token) return;
      this.busy = false; this.ready = true; this.lastVideoTime = -1; this.lastDetect = -100;
      this.calibrate();
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (token === this.token) { this.stop(); this.status('摄像头连接中断，请重新开启。', 'DISCONNECTED'); }
      });
    } catch (error) {
      if (token !== this.token) return;
      this.stop();
      const message = error.name === 'NotAllowedError' ? '未获得摄像头权限，可在浏览器中允许后重试。'
        : error.name === 'NotFoundError' ? '未找到摄像头，请切换练习模式。'
        : error.name === 'NotReadableError' ? '摄像头可能被其他软件占用，请关闭后重试。'
        : '模型加载失败，请检查网络后重试，练习模式仍可游玩。';
      this.status(message, 'OFFLINE');
    }
  }

  stop() {
    this.token++; this.busy = false; this.ready = false;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.srcObject = null; this.direction = { x: 0, y: 0 };
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onState({ label: 'OFFLINE', message: '开启摄像头，让上半身接管能量核心。', ready: false, busy: false, hasVideo: false, body: '待机', hands: '等待指引' });
  }

  calibrate(notify = true) {
    this.baseline = 0; this.samples = []; this.candidate = 'neutral'; this.latched = 'neutral'; this.neutralSince = 0;
    this.direction = { x: 0, y: 0 };
    if (notify) this.status('自然站立约 1 秒，让双肩、手肘和双手完整入镜。', 'CALIBRATING', { ready: this.ready, busy: false, hasVideo: true });
  }

  update(now) {
    if (!this.ready || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime || now - this.lastDetect < 60) return;
    this.lastVideoTime = this.video.currentTime; this.lastDetect = now;
    try {
      const result = this.model.detectForVideo(this.video, now);
      const points = result.landmarks[0]?.map(p => ({ ...p, x: 1 - p.x }));
      this.draw(points);
      const gesture = readGesture(points, this.baseline);
      if (!gesture.tracked) {
        this.direction = { x: 0, y: 0 }; this.candidate = 'neutral'; this.latched = 'neutral'; this.samples = [];
        this.status('退后一点，让双肩、手肘和双手全部入镜。', 'SEARCHING', { body: '等待身体', hands: '等待双手' }); return;
      }
      if (!this.baseline) {
        this.samples.push(gesture.shoulderWidth);
        if (this.samples.length < 20) { this.status(`自然站立 · 校准 ${Math.round(this.samples.length / 20 * 100)}%`, 'CALIBRATING'); return; }
        this.baseline = this.samples.sort((a, b) => a - b)[10];
      }
      this.direction.x += (gesture.x - this.direction.x) * .4;
      this.direction.y += (gesture.y - this.direction.y) * .4;
      this.status('身体控制分合，双手引导方向。', 'TRACKING', { ready: true,
        body: gesture.body === 'split' ? '张开 / 分裂' : gesture.body === 'merge' ? '缩拢 / 合并' : '稳定',
        hands: directionLabel(gesture.x, gesture.y),
      });
      if (this.candidate !== gesture.body) { this.candidate = gesture.body; this.candidateSince = now; }
      if (gesture.body === 'neutral') {
        this.neutralSince ||= now;
        if (now - this.neutralSince > 280) this.latched = 'neutral';
      } else {
        this.neutralSince = 0;
        if (now - this.candidateSince > 260 && this.latched !== gesture.body) {
          this.onAction(gesture.body); this.latched = gesture.body;
        }
      }
    } catch { this.stop(); this.status('动作识别中断，可重新开启或使用练习模式。', 'OFFLINE'); }
  }

  draw(points) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    if (this.canvas.width !== Math.round(rect.width * 2) || this.canvas.height !== Math.round(rect.height * 2)) {
      this.canvas.width = Math.round(rect.width * 2); this.canvas.height = Math.round(rect.height * 2);
    }
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h); if (!points) return;
    const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480, scale = Math.max(w / vw, h / vh);
    const at = i => ({ x: points[i].x * vw * scale + (w - vw * scale) / 2, y: points[i].y * vh * scale + (h - vh * scale) / 2 });
    const visible = i => points[i] && (points[i].visibility ?? 1) > .55;
    for (const [a, b] of [[11, 12], [11, 13], [12, 14], [13, 15], [14, 16], [11, 23], [12, 24], [23, 24]]) {
      if (!visible(a) || !visible(b)) continue;
      const p = at(a), q = at(b); ctx.strokeStyle = b === 15 || b === 16 ? '#ffcb76' : '#66f5ff';
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    for (const i of [11, 12, 13, 14, 15, 16]) {
      if (!visible(i)) continue;
      const p = at(i); ctx.fillStyle = i > 14 ? '#ffcb76' : '#66f5ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, i > 14 ? 7 : 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  dispose() { this.stop(); this.model?.close(); this.model = null; }
}

export function directionLabel(x, y) {
  if (Math.hypot(x, y) < .1) return '等待指引';
  return (y < -.2 ? '↑ ' : y > .2 ? '↓ ' : '') + (x < -.2 ? '← 左' : x > .2 ? '→ 右' : y < 0 ? '上' : '下');
}

function bounded(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Loading timeout')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
