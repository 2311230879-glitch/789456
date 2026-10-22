/** 本地程序纹理：海陆、云系、撞击坑与熔岩。无远程贴图，保存即可修改。 */
const W = 768, H = 384;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), fx), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}
function fbm(x, y, octaves = 5) {
  let total = 0, amplitude = .5;
  for (let i = 0; i < octaves; i++) { total += noise(x, y) * amplitude; x = x * 2.03 + 7; y = y * 2.03 + 3; amplitude *= .5; }
  return total;
}
let textures;
export function getTextures() {
  if (textures) return textures;
  const maps = [0, 1, 2].map(() => new Uint8ClampedArray(W * H * 4));
  // 陆块只提供大尺度轮廓，分形噪声负责海岸与山脉的细节。
  const continents = [[.22,.29,.10,.14], [.30,.58,.055,.20], [.52,.45,.08,.19],
    [.61,.25,.18,.105], [.77,.70,.07,.075], [.45,.14,.045,.05]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, n = fbm(u * 22, v * 12), fine = noise(u * 270, v * 150);
    let land = -2;
    for (const [cx, cy, rx, ry] of continents) land = Math.max(land, 1 - ((u - cx) / rx) ** 2 - ((v - cy) / ry) ** 2);
    land += (n - .48) * 3;
    const cloud = Math.max(0, Math.min(1, (fbm(u * 39 + n * 4, v * 20 + Math.sin(u * 30) * .55) - .48) * 6));
    const ice = Math.max(0, (Math.abs(v - .5) - .405 + n * .035) * 22);
    let earth = land > 0 ? [47 + n * 72, 67 + n * 78, 35 + n * 53] : [8 + n * 10, 30 + n * 51, 58 + n * 66];
    if (land > 0) {
      const aridity = Math.exp(-(((v - .40 + (n - .5) * .14) / .073) ** 2)) * .85;
      earth = earth.map((c, k) => lerp(c, [110 + n * 90, 90 + n * 65, 55 + n * 55][k], aridity));
    }
    if (land > -.15 && land < .03) earth = [19, 75 + n * 60, 89 + n * 65];
    earth = earth.map((c, k) => lerp(lerp(c + (fine - .5) * 11, [206,220,222][k], Math.min(ice, 1)), [226,233,229][k], cloud * .87));
    const vein = Math.abs(noise(u * 31 + n * 7, v * 23 + n * 5) - .49);
    const lava = Math.max(0, 1 - vein / .045) ** 1.8;
    const hot = Math.max(0, 1 - vein / .105) ** 2;
    const dust = fbm(u * 50, v * 30, 3);
    const ember = [51 + dust * 65 + lava * 182, 35 + dust * 37 + lava * 80, 25 + dust * 28 + lava * 12];
    const doom = [23 + dust * 36 + hot * 225, 17 + dust * 22 + hot * hot * 136, 18 + dust * 19 + hot ** 4 * 65];
    const index = (y * W + x) * 4;
    [earth, ember, doom].forEach((color, stage) => {
      maps[stage].set(color.map(c => Math.max(0, Math.min(255, c))), index);
      maps[stage][index + 3] = stage === 0 ? 0 : (stage === 1 ? lava : hot) * 255;
    });
  }
  textures = { maps, width: W, height: H };
  return textures;
}

/** 每个像素映射到球面，贴图按经度缓慢自转；光照固定在左上方。 */
export class PlanetSurface {
  constructor(size = 320) {
    this.size = size;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d'); this.image = this.ctx.createImageData(size, size);
    this.points = []; this.lastTime = -100; this.lastStage = -100;
    const textures = getTextures();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d), light = Math.max(0, -nx * .58 - ny * .42 + nz * .48);
      const lon = Math.atan2(nx, nz) / (Math.PI * 2) + .5;
      const lat = Math.asin(ny) / Math.PI + .5;
      const rim = (1 - nz) ** 4 * Math.max(.1, light);
      this.points.push({ index: (y * size + x) * 4, lon, row: Math.min(textures.height - 1, Math.floor(lat * textures.height)), light, rim, nz });
    }
  }
  draw(time, stage) {
    if (Math.abs(time - this.lastTime) < .10 && Math.abs(stage - this.lastStage) < .018) return this.canvas;
    this.lastTime = time; this.lastStage = stage;
    const { maps, width } = getTextures(), low = Math.min(2, Math.floor(stage)), high = Math.min(2, low + 1), blend = stage - low;
    const a = maps[low], b = maps[high], data = this.image.data, shift = time * .008 + .085;
    const air = [lerp(65, 255, stage / 2), lerp(153, 94, stage / 2), lerp(220, 43, stage / 2)];
    for (const p of this.points) {
      const u = Math.floor(((p.lon + shift) % 1 + 1) % 1 * width), j = (p.row * width + u) * 4;
      const emission = lerp(a[j + 3], b[j + 3], blend) / 255;
      const lighting = .075 + p.light * .98;
      for (let k = 0; k < 3; k++) {
        const surface = lerp(a[j + k], b[j + k], blend);
        data[p.index + k] = surface * Math.max(lighting, emission * (.65 + stage * .15)) + air[k] * p.rim * .65;
      }
      data[p.index + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
    return this.canvas;
  }
}
