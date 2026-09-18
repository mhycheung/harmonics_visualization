import * as THREE from 'three';
import { makeSYlm, glyphAngle } from './swsh.js';

const LMAX = 5;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ state
const st = { sign: -1, sabs: 2, time: 1, sum: 0, mirror: 1, lsign: 1, playing: true,
             speed: 0.5, wt: 0, density: 260, gscale: 1 };
const spin = () => (st.sabs === 0 ? 0 : st.sign * st.sabs);
let dirty = true;

// ---------------------------------------------------------------- colormaps
const INFERNO = [[0,0,4],[22,11,57],[66,10,104],[106,23,110],[147,38,103],[188,55,84],
                 [221,81,58],[243,120,25],[252,165,10],[246,215,70],[252,255,164]];
const RDBU_R  = [[5,48,97],[33,102,172],[67,147,195],[146,197,222],[209,229,240],[247,247,247],
                 [253,219,199],[244,165,130],[214,96,77],[178,24,43],[103,0,31]];
function rampRGB(stops, u) {
  const x = Math.min(1, Math.max(0, u)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i, a = stops[i], b = stops[i + 1];
  return [0, 1, 2].map((c) => a[c] + f * (b[c] - a[c]));
}
// |f| uses inferno from 0.08 up, so zero is very dark but not pure black
const MAG_LO = 0.08;
function lutTexture(stops, lo) {
  const n = 256, d = new Uint8Array(4 * n);
  for (let i = 0; i < n; i++) {
    const c = rampRGB(stops, lo + (1 - lo) * i / (n - 1));
    d.set([c[0], c[1], c[2], 255], 4 * i);
  }
  const t = new THREE.DataTexture(d, n, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
const LUT_MAG = lutTexture(INFERNO, MAG_LO), LUT_DIV = lutTexture(RDBU_R, 0);

// --------------------------------------------------------------- renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setClearColor(0x000000, 0);
renderer.setScissorTest(true);
const camera = new THREE.OrthographicCamera(-1.32, 1.32, 1.32, -1.32, 0.1, 10);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);

// World orientation shared by every sphere: Q = Rx(-pi/2 + TILT) Rz(azimuth).
// Physics z is drawn up the screen, tilted TILT toward the viewer, and rotated so
// that phi = 0 is not face-on.
const TILT = 0.38, AZ0 = -0.55;
function zUpOrientation(az) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 + TILT);
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), az));
}
const defaultOrientation = () => zUpOrientation(AZ0);
const Q = defaultOrientation();
// Azimuth of the z-up orientation closest to Q: for Q = Rx(b) Rz(a), world x-components
// of the physics x and y axes are cos(a) and -sin(a).
function azimuthOf(q) {
  const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ey = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return Math.atan2(-ey.x, ex.x);
}
let zlock = false, az = AZ0;

// ---------------------------------------------------------- sphere geometry
// Built once; physics coordinates (poles on z).
const SPHERE_GEO = new THREE.SphereGeometry(1, 120, 80);
SPHERE_GEO.rotateX(Math.PI / 2);
const SPH_POS = SPHERE_GEO.attributes.position.array;
const NV = SPH_POS.length / 3;
const SPH_TP = new Float64Array(2 * NV);
for (let i = 0; i < NV; i++) {
  const x = SPH_POS[3*i], y = SPH_POS[3*i+1], z = SPH_POS[3*i+2];
  SPH_TP[2*i] = Math.acos(Math.max(-1, Math.min(1, z)));
  SPH_TP[2*i+1] = Math.atan2(y, x);
}

const VERT = `
  attribute vec2 aA; attribute vec2 aB;
  varying vec2 vA; varying vec2 vB; varying float vShade;
  void main() {
    vA = aA; vB = aB;
    vec3 n = normalize(normalMatrix * normal);
    vShade = 0.78 + 0.22 * max(n.z, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = `
  uniform vec2 uPA; uniform vec2 uPB; uniform float uNorm; uniform int uMode;
  uniform sampler2D uLut;
  varying vec2 vA; varying vec2 vB; varying float vShade;
  vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
  void main() {
    vec2 f = cmul(vA, uPA) + cmul(vB, uPB);
    float u = (uMode == 0) ? 0.5 + 0.5 * f.x * uNorm : length(f) * uNorm;
    vec3 c = texture2D(uLut, vec2(clamp(u, 0.0, 1.0) * (255.0/256.0) + 0.5/256.0, 0.5)).rgb;
    gl_FragColor = vec4(c * vShade, 1.0);
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------- fibonacci grid
function fibonacci(n) {
  const g = Math.PI * (3 - Math.sqrt(5)), pts = [];
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - z * z), p = i * g;
    const th = Math.acos(z), ph = Math.atan2(Math.sin(p), Math.cos(p));
    const ct = Math.cos(th), s_ = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    pts.push({ th, ph, n: [r * Math.cos(p), r * Math.sin(p), z],
               et: [ct * cp, ct * sp, -s_], ep: [-sp, cp, 0] });
  }
  return pts;
}

// ------------------------------------------------------------------ cells
const grid = $('grid');
let cells = [];
const glyphMat = new THREE.MeshBasicMaterial({ color: 0x07070c, side: THREE.DoubleSide });
const zStubMat = new THREE.LineBasicMaterial({ color: 0xaab2c4 });
const xStubMat = new THREE.LineBasicMaterial({ color: 0x5d6578 });
const stubGeo = (v, len) => new THREE.BufferGeometry().setFromPoints(
  [new THREE.Vector3(...v).multiplyScalar(1.0), new THREE.Vector3(...v).multiplyScalar(len)]);
const Z_STUB = stubGeo([0, 0, 1], 1.28), X_STUB = stubGeo([1, 0, 0], 1.16);

function disposeCells() {
  for (const c of cells) {
    c.mesh.geometry.dispose(); c.mesh.material.dispose();
    if (c.glyph) c.glyph.geometry.dispose();
  }
  cells = [];
}

function buildCell(l, m, el) {
  const s = spin();
  const fA = makeSYlm(s, l, m);
  const fB0 = (st.sum && m !== 0) ? makeSYlm(s, l, -m) : null;
  // lsign: -m term carries (-1)^l; with mirror (e^{+iwt}) this is the nonprecessing-BBH
  // symmetry h_{l,-m} = (-1)^l h*_{lm}
  const bs = (st.lsign && l % 2) ? -1 : 1;
  const fB = fB0 && ((t, p) => { const v = fB0(t, p); return [bs * v[0], bs * v[1]]; });
  const A = new Float32Array(2 * NV), B = new Float32Array(2 * NV);
  for (let i = 0; i < NV; i++) {
    const a = fA(SPH_TP[2*i], SPH_TP[2*i+1]); A[2*i] = a[0]; A[2*i+1] = a[1];
    if (fB) { const b = fB(SPH_TP[2*i], SPH_TP[2*i+1]); B[2*i] = b[0]; B[2*i+1] = b[1]; }
  }
  const geo = SPHERE_GEO.clone();
  geo.setAttribute('aA', new THREE.BufferAttribute(A, 2));
  geo.setAttribute('aB', new THREE.BufferAttribute(B, 2));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uPA: { value: new THREE.Vector2(1, 0) }, uPB: { value: new THREE.Vector2(1, 0) },
                uNorm: { value: 1 }, uMode: { value: s === 0 ? 0 : 1 },
                uLut: { value: s === 0 ? LUT_DIV : LUT_MAG } } });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh, new THREE.Line(Z_STUB, zStubMat), new THREE.Line(X_STUB, xStubMat));
  const scene = new THREE.Scene(); scene.add(group);
  const cell = { l, m, el, A, B, fA, fB, mesh, group, scene, glyph: null, gpts: null, norm: 1 };
  if (s !== 0) buildGlyphs(cell);
  updateNorm(cell);
  return cell;
}

function buildGlyphs(cell) {
  const pts = fibonacci(st.density);
  cell.gpts = pts.map((p) => {
    const a = cell.fA(p.th, p.ph), b = cell.fB ? cell.fB(p.th, p.ph) : [0, 0];
    return { ...p, a, b };
  });
  const vPer = st.sabs === 1 ? 9 : 6;                  // arrow: shaft quad + head; segment: quad
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.length * vPer * 3), 3));
  if (cell.glyph) { cell.group.remove(cell.glyph); cell.glyph.geometry.dispose(); }
  cell.glyph = new THREE.Mesh(geo, glyphMat);
  cell.glyph.frustumCulled = false;
  cell.group.add(cell.glyph);
}

// Normalization: max |f| over the sphere and over one period.
function updateNorm(cell) {
  const mirror = st.sum && st.time && st.mirror;
  let mx = 0;
  const upd = (ar, ai, br, bi) => {
    const v = mirror ? Math.hypot(ar, ai) + Math.hypot(br, bi) : Math.hypot(ar + br, ai + bi);
    if (v > mx) mx = v;
  };
  for (let i = 0; i < NV; i++) upd(cell.A[2*i], cell.A[2*i+1], cell.B[2*i], cell.B[2*i+1]);
  if (cell.gpts) for (const p of cell.gpts) upd(p.a[0], p.a[1], p.b[0], p.b[1]);
  cell.norm = mx > 1e-12 ? 1 / mx : 0;
  cell.mesh.material.uniforms.uNorm.value = cell.norm;
}

function updateGlyphs(cell, pa, pb) {
  const s = spin(), arrow = st.sabs === 1;
  const pos = cell.glyph.geometry.attributes.position.array;
  const N = cell.gpts.length;
  const spacing = Math.sqrt(4 * Math.PI / N);
  const Lmax = 0.46 * spacing * st.gscale;               // half-length at |f| = max
  const R = 1.006;
  let k = 0;
  const put = (x, y, z) => { pos[k++] = x; pos[k++] = y; pos[k++] = z; };
  for (const p of cell.gpts) {
    const fr = p.a[0]*pa[0] - p.a[1]*pa[1] + p.b[0]*pb[0] - p.b[1]*pb[1];
    const fi = p.a[0]*pa[1] + p.a[1]*pa[0] + p.b[0]*pb[1] + p.b[1]*pb[0];
    const u = Math.hypot(fr, fi) * cell.norm;
    const vcount = arrow ? 9 : 6;
    if (u < 0.03) { for (let j = 0; j < vcount * 3; j++) pos[k++] = 0; continue; }
    const chi = glyphAngle(s, fr, fi), c = Math.cos(chi), sn = Math.sin(chi);
    const d = [0, 1, 2].map((j) => c * p.et[j] + sn * p.ep[j]);   // glyph direction
    const w = [0, 1, 2].map((j) => c * p.ep[j] - sn * p.et[j]);   // n x d
    const L = Lmax * u;
    const W = (0.010 + 0.022 * u) * st.gscale * Math.sqrt(260 / N);
    const P = (t, o) => [0, 1, 2].map((j) => R * p.n[j] + t * d[j] + o * w[j]);
    const quad = (t0, t1, hw) => {
      const a = P(t0, -hw), b = P(t0, hw), cc = P(t1, hw), dd = P(t1, -hw);
      put(...a); put(...b); put(...cc); put(...a); put(...cc); put(...dd);
    };
    if (!arrow) quad(-L, L, W);
    else {
      const H = Math.min(0.5 * L + 0.4 * W, 0.9 * L);
      quad(-L, L - H, W);
      put(...P(L - H, -2.6 * W)); put(...P(L - H, 2.6 * W)); put(...P(L, 0));
    }
  }
  cell.glyph.geometry.attributes.position.needsUpdate = true;
}

// -------------------------------------------------------------- grid layout
function rebuild() {
  disposeCells();
  grid.innerHTML = '';
  const s = spin(), l0 = Math.abs(s);
  const mCols = st.sum ? [...Array(LMAX + 1).keys()] : [...Array(2 * LMAX + 1).keys()].map((i) => i - LMAX);
  const size = +$('csize').value;
  grid.style.gridTemplateColumns = `44px repeat(${mCols.length}, ${size}px)`;
  const add = (html, cls) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; grid.appendChild(d); return d; };
  add('', 'collab');
  for (const m of mCols) add(st.sum && m ? `m = ±${m}` : `m = ${m}`, 'collab');
  for (let l = l0; l <= LMAX; l++) {
    add(`ℓ = ${l}`, 'rowlab');
    for (const m of mCols) {
      if (Math.abs(m) > l) { add('', 'cell'); continue; }
      const el = add(`<div class="tag">${st.sum && m ? `ℓ${l}, ±${m}` : `ℓ${l}, ${m}`}</div><div class="view"></div>`, 'cell');
      cells.push(buildCell(l, m, el.querySelector('.view')));
    }
  }
  refreshLegend();
  dirty = true;
}

// ------------------------------------------------------------------ drag
// Dragging a sphere rotates every sphere; dragging empty space (or shift/right-drag
// anywhere) pans the zoomed grid.
let drag = null;
const viewport = $('viewport');
const view = { k: 1, tx: 0, ty: 0 };                       // grid transform: translate, then scale
function applyView() {
  grid.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`;
  dirty = true;
}
function fitView() {
  view.k = 1;
  view.tx = Math.max(0, (viewport.clientWidth - grid.offsetWidth) / 2);
  view.ty = 0;
  applyView();
}
function startDrag(e) {
  const pan = e.shiftKey || e.button === 2 || !e.target.closest('.view');
  drag = { x: e.clientX, y: e.clientY, pan, el: pan ? viewport : e.target.closest('.view') };
  drag.el.classList.add('dragging');
  e.preventDefault();
}
viewport.addEventListener('pointerdown', startDrag);
viewport.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pan) { view.tx += dx; view.ty += dy; applyView(); return; }
  const k = 3.2 / Math.max(80, drag.el.getBoundingClientRect().width);
  if (zlock) {
    az += dx * k;
    Q.copy(zUpOrientation(az));
  } else {
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k);
    Q.premultiply(qy).premultiply(qx);
  }
  dirty = true;
});
window.addEventListener('pointerup', () => { if (drag) drag.el.classList.remove('dragging'); drag = null; });
viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = viewport.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  const k1 = Math.min(10, Math.max(0.25, view.k * Math.exp(-dy * 0.0015)));
  const f = k1 / view.k;
  view.tx = cx - (cx - view.tx) * f; view.ty = cy - (cy - view.ty) * f; view.k = k1;
  applyView();
}, { passive: false });
$('reset').onclick = () => { az = AZ0; Q.copy(defaultOrientation()); dirty = true; };
$('rezoom').onclick = fitView;
$('zlock').onclick = () => {
  zlock = !zlock;
  if (zlock) { az = azimuthOf(Q); Q.copy(zUpOrientation(az)); }
  $('zlock').classList.toggle('on', zlock);
  dirty = true;
};
$('convbtn').onclick = () => $('conv').classList.toggle('open');
$('convclose').onclick = () => $('conv').classList.remove('open');

// -------------------------------------------------------------- controls
function syncButtons() {
  for (const b of document.querySelectorAll('button[data-k]')) b.classList.toggle('on', st[b.dataset.k] === +b.dataset.v);
  for (const b of document.querySelectorAll('button[data-k="sign"]')) b.disabled = st.sabs === 0;
  for (const b of document.querySelectorAll('button[data-k="mirror"]')) b.disabled = !(st.sum && st.time);
  $('lsign').disabled = !st.sum; $('lsign').classList.toggle('on', !!st.lsign);
  for (const id of ['gdens', 'gsize']) $(id).style.opacity = st.sabs === 0 ? 0.35 : 1;
  $('play').disabled = !st.time; $('phase').disabled = !st.time;
  $('play').textContent = st.playing ? '⏸ pause' : '▶ play';
}
for (const b of document.querySelectorAll('button[data-k]')) {
  b.onclick = () => {
    const k = b.dataset.k, v = +b.dataset.v;
    if (st[k] === v) return;
    st[k] = v;
    syncButtons();
    if (k === 'mirror') cells.forEach(updateNorm);
    else if (k === 'time') { cells.forEach(updateNorm); refreshLegend(); }
    else rebuild();
    dirty = true;
  };
}
$('lsign').onclick = () => { st.lsign = 1 - st.lsign; syncButtons(); rebuild(); };
$('play').onclick = () => { st.playing = !st.playing; syncButtons(); };
$('speed').oninput = (e) => { st.speed = +e.target.value; };
$('phase').oninput = (e) => { st.wt = +e.target.value; st.playing = false; syncButtons(); dirty = true; };
$('density').onchange = (e) => { st.density = +e.target.value; if (spin()) { cells.forEach((c) => { buildGlyphs(c); updateNorm(c); }); dirty = true; } };
$('gscale').oninput = (e) => { st.gscale = +e.target.value; dirty = true; };
$('csize').onchange = () => { rebuild(); fitView(); };
window.addEventListener('resize', () => { dirty = true; });
window.addEventListener('scroll', () => { dirty = true; }, { passive: true });

function refreshLegend() {
  const s = spin(), cv = $('legc'), ctx = cv.getContext('2d');
  for (let i = 0; i < cv.width; i++) {
    const u = i / (cv.width - 1);
    const c = s === 0 ? rampRGB(RDBU_R, u) : rampRGB(INFERNO, MAG_LO + (1 - MAG_LO) * u);
    ctx.fillStyle = `rgb(${c.map(Math.round).join(',')})`; ctx.fillRect(i, 0, 1, cv.height);
  }
  $('leglab').textContent = s === 0 ? 'Re f / max|f|' : '|f| / max|f|';
  $('leg0').textContent = s === 0 ? '−1' : '0';
  $('leg1').textContent = '1';
}

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (st.time && st.playing) {
    st.wt = (st.wt + dt * st.speed * 2 * Math.PI / 4) % (2 * Math.PI);
    $('phase').value = st.wt;
    dirty = true;
  }
  if (dirty) { render(); dirty = false; }
  requestAnimationFrame(frame);
}

function render() {
  const W = window.innerWidth, H = window.innerHeight;
  const sz = renderer.getSize(new THREE.Vector2());
  if (sz.x !== W || sz.y !== H) renderer.setSize(W, H, false);
  renderer.setScissor(0, 0, W, H); renderer.clear();
  const wt = st.time ? st.wt : 0;
  const pa = [Math.cos(wt), -Math.sin(wt)];                       // e^{-i w t}
  const pb = st.sum && st.time && st.mirror ? [Math.cos(wt), Math.sin(wt)] : pa;
  $('readout').textContent = st.time ? `ωt = ${(wt / Math.PI).toFixed(2)} π` : 'static';
  const top = viewport.getBoundingClientRect().top;
  for (const c of cells) {
    const r = c.el.getBoundingClientRect();
    if (r.bottom < top || r.top > H || r.right < 0 || r.left > W) continue;
    c.group.quaternion.copy(Q);
    const u = c.mesh.material.uniforms;
    u.uPA.value.set(pa[0], pa[1]); u.uPB.value.set(pb[0], pb[1]);
    if (c.glyph) updateGlyphs(c, pa, pb);
    // clip at the top of the viewport so spheres pan under the header
    const y0 = Math.max(r.top, top);
    if (r.bottom <= y0) continue;
    renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
    renderer.setScissor(r.left, H - r.bottom, r.width, r.bottom - y0);
    renderer.render(c.scene, camera);
  }
}

// ------------------------------------------------------------------ start
$('csize').value = Math.max(60, Math.min(160, Math.floor((window.innerWidth - 110) / 11.3)));
syncButtons();
rebuild();
fitView();
window.__swsh = { st, cells: () => cells, spin, view, Q };                // for the headless checks
requestAnimationFrame(frame);
