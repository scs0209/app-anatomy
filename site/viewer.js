// 3D 분해도. 해석 결과의 노드 하나가 블록 하나다. 디자인 값은 DESIGN.md를 따른다.
// three.js는 vendor/three 에 실어 직접 제공한다(MIT, vendor/three/LICENSE).
import * as THREE from "./vendor/three/three.module.min.js";
import { Line2 } from "./vendor/three/lines/Line2.js";
import { LineGeometry } from "./vendor/three/lines/LineGeometry.js";
import { LineSegments2 } from "./vendor/three/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "./vendor/three/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "./vendor/three/lines/LineMaterial.js";
import { EffectComposer } from "./vendor/three/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/three/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/three/postprocessing/OutputPass.js";
import { layoutItems, INK, hatched, fmt, pct, short } from "./layout.js";
export { reduce } from "./layout.js";

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 칩. 해석 결과의 노드 하나가 블록 하나다. 바닥 면적 = 바이트, 높이 = 층, 색 = 출처. 카메라는 정사영.
// 닫으면 기판 위의 칩 패키지 하나. 열면 덮개가 떠오르고 층이 위로 떨어지며, 큰 부품에서 회로선이 라벨까지 뻗는다.
export function chip(host, data, opts = {}) {
  const TH = [1.8, 3, 3.4, 3.4], GAP = opts.gap || 16, AWAY = 190, MW = 100, MH = 70, PLATE = 0.9;
  const baseY = L => { let y = PLATE; for (let i = 0; i < L; i++) y += TH[Math.min(i, TH.length - 1)]; return y; };
  // 배치: 노드마다 사각형과 층을 정한다. 묶음(container)은 그리지 않고 자리만 물려준다.
  const items = layoutItems(data, MW, MH);
  const maxLayer = Math.max(0, ...items.map(i => i.layer));
  const bySrc = new Map(items.map(i => [i.node.src, i])), find = src => bySrc.get(src) || null;
  // WebGL을 쓸 수 없으면 3D만 빼고 나머지(표, 목록)는 그대로 동작한다.
  let renderer; try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { renderer = null; }
  if (!renderer) {
    const msg = document.createElement("p"); msg.className = "nogl"; msg.textContent = opts.noglText || ""; host.append(msg);
    return { items, total: data.total, lifted: maxLayer + 1, open: true, layers: maxLayer + 1, nogl: true, place() {}, settle() {}, highlight() {}, find, dispose() { msg.remove(); } };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement; canvas.className = "gl"; canvas.tabIndex = 0; canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", opts.alt || "");
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true;
  host.append(canvas, tip);
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000), ray = new THREE.Raycaster();
  const BOARD = css("--board"), ICE = css("--ice");
  scene.background = new THREE.Color(opts.bg || BOARD);
  const composer = new EffectComposer(renderer), bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.7, 0.84);
  composer.addPass(new RenderPass(scene, cam)); composer.addPass(bloom); composer.addPass(new OutputPass());
  const az0 = opts.az ?? -0.66; let az = az0, el = opts.el ?? 0.6, W = 1, H = 1, cy = 0, hot = null, touched = false;


  const unit = new THREE.BoxGeometry(1, 1, 1), unitEdges = new THREE.EdgesGeometry(unit);
  const lineMats = [], callouts = []; let outline = null; const lid = { group: new THREE.Group(), y: 0, ty: 0, t0: 0 };
  function hatchTex(bg, ink) {
    const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, 32, 32); g.strokeStyle = ink; g.lineWidth = 4; g.lineCap = "square";
    for (const d of [-32, 0, 32]) { g.beginPath(); g.moveTo(d, 32); g.lineTo(d + 32, 0); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  const FONT = `Archivo, "Pretendard Variable", sans-serif`, MONO = `"JetBrains Mono", monospace`;
  function fit(g, text, weight, start, min, max) {
    let size = start; g.font = `${weight} ${size}px ${FONT}`;
    while (g.measureText(text).width > max && size > min) { size -= 3; g.font = `${weight} ${size}px ${FONT}`; }
    if (g.measureText(text).width > max) { while (text.length > 4 && g.measureText(text + "…").width > max) text = text.slice(0, -1); text += "…"; }
    return text;
  }
  function topTex(l1, l2, color) { // 블록 윗면에 찍는 이름
    const c = document.createElement("canvas"); c.width = 640; c.height = 160; const g = c.getContext("2d");
    g.fillStyle = color; l1 = fit(g, l1, 700, 72, 34, 620); g.fillText(l1, 4, 84); g.font = `500 44px ${MONO}`; g.fillText(l2, 4, 142);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function calloutTex(name, sub, hex, hatch) { // 기판에 누운 라벨: 귀퉁이 표시 안에 이름, 아래에 수치
    const c = document.createElement("canvas"); c.width = 768; c.height = 208; const g = c.getContext("2d");
    g.fillStyle = "#FFFFFF"; g.textBaseline = "middle"; name = fit(g, name.toUpperCase(), 800, 60, 30, 690);
    const tw = g.measureText(name).width, x0 = 6, x1 = Math.min(762, x0 + tw + 60), y0 = 6, y1 = 110;
    g.fillText(name, x0 + 30, 60);
    g.strokeStyle = "#FFFFFF"; g.lineWidth = 5; g.lineCap = "square"; const s = 22;
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { g.beginPath(); g.moveTo(x + dx * s, y); g.lineTo(x, y); g.lineTo(x, y + dy * s); g.stroke(); }
    g.save(); g.beginPath(); g.rect(x0 + 4, 150, 40, 26); g.clip(); g.fillStyle = hex; g.fillRect(x0 + 4, 150, 40, 26);
    if (hatch) { g.strokeStyle = BOARD; g.lineWidth = 4; for (let d = -26; d < 44; d += 11) { g.beginPath(); g.moveTo(x0 + 4 + d, 176); g.lineTo(x0 + 4 + d + 26, 150); g.stroke(); } }
    g.restore(); g.fillStyle = "#C9D6DA"; g.font = `500 38px ${MONO}`; g.fillText(sub, x0 + 60, 164);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  const lum = hex => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

  function build() {
    const mats = {}, edgeMats = {};
    const mat = (hex, glow) => mats[hex + glow] || (mats[hex + glow] = new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: glow }));
    const edgeMat = hex => edgeMats[hex] || (edgeMats[hex] = new THREE.LineBasicMaterial({ color: hex }));
    const box = (parent, sx, sy, sz, px, py, pz, material, edgeHex) => {
      const m = new THREE.Mesh(unit, material); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; parent.add(m);
      if (edgeHex) { const e = new THREE.LineSegments(unitEdges, edgeMat(edgeHex)); e.scale.copy(m.scale); e.position.copy(m.position); parent.add(e); }
      return m;
    };
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1c2630, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-70, 150, 95); sun.castShadow = true; scene.add(sun);
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 4; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.35;
    Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 1, far: 560 }); sun.shadow.camera.updateProjectionMatrix();
    // 기판: 어두운 바닥, 옅은 격자, 교차점의 점
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: "#0D1115" })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05; floor.receiveShadow = true; scene.add(floor);
    const CELL = 24, N = 40, grid = new THREE.GridHelper(CELL * N, N, css("--grid"), css("--grid")); grid.position.y = -0.02; scene.add(grid);
    const dots = []; for (let i = -N / 2; i <= N / 2; i++) for (let j = -N / 2; j <= N / 2; j++) dots.push(i * CELL, 0, j * CELL);
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
    scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: "#8FA6AE", size: 2.2 * Math.min(devicePixelRatio || 1, 2), sizeAttenuation: false })));
    // 패키지: 받침판과 네 변의 다리
    const pkg = new THREE.Group(); scene.add(pkg);
    box(pkg, MW + 12, PLATE, MH + 12, 0, PLATE / 2, 0, mat("#11171C", 0), ICE);
    const pin = mat("#96A2A8", 0);
    for (let u = -MW / 2 + 2; u <= MW / 2 - 2; u += 4) { box(pkg, 1.5, 1.2, 3, u, 0.6, MH / 2 + 7, pin); box(pkg, 1.5, 1.2, 3, u, 0.6, -MH / 2 - 7, pin); }
    for (let u = -MH / 2 + 2; u <= MH / 2 - 2; u += 4) { box(pkg, 3, 1.2, 1.5, MW / 2 + 7, 0.6, u, pin); box(pkg, 3, 1.2, 1.5, -MW / 2 - 7, 0.6, u, pin); }
    const hatchBase = {};
    for (const it of items) {
      const [x, y, w, h] = it.rect, th = TH[Math.min(it.layer, TH.length - 1)], o = it.node.o;
      const structural = !it.leaf && (it.node.k === "app" || it.node.k === "runtime" || !o);
      const hex = structural ? css("--substrate") : o ? css("--" + INK[o]) : css("--overhead");
      const gap = Math.min(0.3, w * 0.1, h * 0.1), bw = w - gap * 2, bh = h - gap * 2;
      let m;
      if (structural || !o) m = mat(hex, 0);
      else if (hatched(o)) {
        const t = (hatchBase[hex] || (hatchBase[hex] = hatchTex(hex, BOARD))).clone(); t.needsUpdate = true; t.repeat.set(bw / 3.2, bh / 3.2);
        const side = mat(hex, 0.22); m = [side, side, new THREE.MeshLambertMaterial({ map: t, emissiveMap: t, emissive: "#ffffff", emissiveIntensity: 0.22 }), side, side, side];
      } else m = mat(hex, 0.22);
      const group = new THREE.Group();
      const eh = structural ? "#5E7C86" : o ? new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), 0.45).getStyle() : "#4A5560";
      const mesh = box(group, bw, th, bh, 0, th / 2, 0, m, eh); mesh.userData.it = it;
      group.position.set(x + w / 2 - MW / 2, baseY(it.layer), y + h / 2 - MH / 2); scene.add(group);
      Object.assign(it, { group, mesh, th, hex, bw, bh, lift: 0, cx: x + w / 2 - MW / 2, cz: y + h / 2 - MH / 2, mat: m, edge: group.children[1], edgeMat: group.children[1].material, dead: false });
      const long = Math.max(bw, bh), cross = Math.min(bw, bh), pw = Math.min(long * 0.88, cross * 0.8 * 4);
      if (pw >= 7.5 && it.layer > 0) {
        const dark = lum(hex) > 0.36, tex = topTex(short(it.node.n), `${fmt(it.node.b)}  ${pct(it.node.b, data.total)}`, dark ? "#0A0D10" : "#E7EEF0");
        const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        p.rotation.x = -Math.PI / 2; if (bh > bw) p.rotation.z = -Math.PI / 2; p.renderOrder = 2;
        const inset = Math.min(1.2, cross * 0.1);
        if (bh > bw) p.position.set(-bw / 2 + inset + pw / 8, th + 0.04, -bh / 2 + inset + pw / 2); else p.position.set(-bw / 2 + inset + pw / 2, th + 0.04, -bh / 2 + inset + pw / 8);
        group.add(p); it.label = p;
      }
    }
    // 덮개: 닫힌 칩의 빛나는 윗판. 열면 위로 떠올라 사라진다.
    const glow = new THREE.MeshLambertMaterial({ color: ICE, emissive: ICE, emissiveIntensity: 0.7 });
    box(lid.group, MW + 1, 1.4, MH + 1, 0, 0.7, 0, mat("#1A2229", 0), ICE);
    box(lid.group, MW * 0.66, 1.2, MH * 0.66, 0, 2.0, 0, mat("#222C34", 0), ICE);
    box(lid.group, MW * 0.5, 1.0, MH * 0.5, 0, 3.1, 0, glow, "#FFFFFF");
    scene.add(lid.group);
    const om = new LineMaterial({ color: "#ffffff", linewidth: 2.5 }); lineMats.push(om);
    outline = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(unitEdges), om); outline.visible = false; scene.add(outline);

    // 회로선과 라벨: 라이브러리 층의 큰 부품에서 기판을 따라 뻗는다
    const want = opts.callouts || 0; if (!want) return;
    const SIDES = { front: { n: [0, 1], t: [1, 0], edge: MH / 2 + 8, sep: 40, lo: -100, hi: -100 + 40 * Math.max(1, (opts.callouts || 1) - 1), cap: 6 } }; // 라벨은 칩 앞쪽에 두 줄로 엇갈려 놓는다
    const picked = items.filter(i => i.layer === (opts.calloutLayer ?? 2)).sort((a, b) => b.node.b - a.node.b).slice(0, want), bySide = { front: [] };
    for (const it of picked) {
      const dist = s => SIDES[s].edge - (it.cx * SIDES[s].n[0] + it.cz * SIDES[s].n[1]);
      const side = Object.keys(SIDES).sort((a, b) => dist(a) - dist(b)).find(s => bySide[s].length < SIDES[s].cap); if (side) bySide[side].push(it);
    }
    const traceMat = new LineMaterial({ color: ICE, linewidth: 1.6 }); lineMats.push(traceMat);
    const riserMat = new THREE.LineBasicMaterial({ color: "#7FA4AD" });
    for (const [name, list] of Object.entries(bySide)) {
      const S = SIDES[name], [nx, nz] = S.n, [tx, tz] = S.t;
      list.sort((a, b) => (a.cx * tx + a.cz * tz) - (b.cx * tx + b.cz * tz));
      const u1 = list.map(it => clamp(it.cx * tx + it.cz * tz, S.lo, S.hi));
      for (let i = 1; i < u1.length; i++) u1[i] = Math.max(u1[i], u1[i - 1] + S.sep);
      const over = u1.length ? u1[u1.length - 1] - S.hi : 0; if (over > 0) for (let i = 0; i < u1.length; i++) u1[i] -= over;
      list.forEach((it, i) => {
        const u0 = it.cx * tx + it.cz * tz, half = (nx ? it.bw : it.bh) / 2 - 0.4, c0 = it.cx * nx + it.cz * nz;
        const a = S.edge + 7 + i * 3, L = S.edge + 20 + (i % 2) * 28, du = u1[i] - u0, d = Math.min(Math.abs(du), Math.max(0, L - a - 3)), sg = Math.sign(du) || 1;
        const P = (nd, td) => new THREE.Vector3(nx * nd + tx * td, 0.12, nz * nd + tz * td);
        const pts = [P(c0 + half, u0), P(a, u0), P(a + d, u0 + sg * d)]; if (Math.abs(du) - d > 0.01) pts.push(P(a + d, u1[i])); pts.push(P(L, u1[i]));
        const fine = []; for (let k = 0; k < pts.length - 1; k++) { const A = pts[k], B = pts[k + 1], steps = Math.max(1, Math.ceil(A.distanceTo(B) / 1.5)); for (let s = 0; s < steps; s++) { const v = A.clone().lerp(B, s / steps); fine.push(v.x, v.y, v.z); } }
        const E = pts[pts.length - 1]; fine.push(E.x, E.y, E.z);
        const line = new Line2(new LineGeometry().setPositions(fine), traceMat); line.geometry.instanceCount = 0; scene.add(line);
        const riser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]), riserMat); riser.position.copy(pts[0]); riser.position.y = PLATE; scene.add(riser);
        const pad = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0 })); pad.rotation.x = -Math.PI / 2; pad.position.copy(E); pad.position.y = 0.14; scene.add(pad);
        const lw = 72, lh = lw * 208 / 768, o = it.node.o;
        const label = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: calloutTex(short(it.node.n), `${fmt(it.node.b)} · ${pct(it.node.b, data.total)}`, it.hex, hatched(o)), transparent: true, opacity: 0, depthWrite: false }));
        label.rotation.x = -Math.PI / 2; label.position.set(E.x + (nx ? nx * (lw / 2 + 2.5) : lw / 2 - 6), 0.16, E.z + (nz ? nz * (lh / 2 + 2) : 0)); scene.add(label);
        callouts.push({ it, line, riser, pad, label, segs: fine.length / 3 - 1, p: 0, t0: 0, order: callouts.length });
      });
    }
  }
  function resize() {
    W = host.clientWidth || 1; H = host.clientHeight || 1; renderer.setSize(W, H, false); composer.setSize(W, H);
    const aspect = W / H, halfH = Math.max(opts.halfH || 64, (opts.halfW || 70) / aspect), halfW = halfH * aspect, sx = (opts.shiftX || 0) * halfW, sy = (opts.shiftY || 0) * halfH;
    cam.left = -halfW + sx; cam.right = halfW + sx; cam.top = halfH + sy; cam.bottom = -halfH + sy; cam.updateProjectionMatrix();
    for (const m of lineMats) m.resolution.set(W, H);
    kick();
  }
  const rnd = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const closedTop = () => { const top = Math.min(maxLayer, Math.max(1, api.lifted) - 1); return baseY(top) + TH[Math.min(top, 3)]; };
  let removed = new Set();
  const gone = it => { for (let x = it; x; x = x.parent) if (removed.has(x)) return true; return false; };
  // 무너진 부품: 빠진 부품에 기대던 것들. 색을 잃고 제 층에서 내려앉는다.
  let fallen = new Set();
  const fell = it => { for (let x = it; x; x = x.parent) if (fallen.has(x)) return true; return false; };
  const DEAD = new THREE.MeshLambertMaterial({ color: "#161B20" }), DEAD_EDGE = new THREE.LineBasicMaterial({ color: "#36414A" });
  function setDead(it, on) {
    if (it.dead === on || !it.mesh) return;
    it.dead = on; it.mesh.material = on ? DEAD : it.mat; it.edge.material = on ? DEAD_EDGE : it.edgeMat;
    if (it.label) it.label.material.opacity = on ? 0.28 : 1;
    const r = on ? rnd(it.cx * 7.3 + it.cz * 3.1) - 0.5 : 0; it.group.rotation.set(r * 0.07, 0, on ? (rnd(it.cz * 5.7 + it.cx) - 0.5) * 0.07 : 0); // 살짝 기운다
  }
  // 시각은 이 함수로만 읽는다. api.clock을 주면 그 시계를 쓴다(영상을 한 장씩 찍을 때 실제 시간과 무관하게 진행시키려고).
  const clock = () => (api && api.clock ? api.clock() : performance.now());
  const api = {
    items, total: data.total, lifted: maxLayer + 1, open: true, layers: maxLayer + 1, find,
    place(instant) {
      const now = clock(), still = instant || reduced.matches;
      items.forEach((it, i) => {
        it.ty = baseY(it.layer) + it.layer * (api.open ? GAP : 0) + (it.layer >= api.lifted || gone(it) ? AWAY : 0) - (api.open && it.dead ? Math.min(GAP * 0.45, 6) : 0);
        it.t0 = now + (api.open ? 260 : 0) + ((api.open ? it.layer : maxLayer - it.layer) * 110 + rnd(i) * 260);
        if (still) { it.y = it.ty; it.t0 = 0; }
      });
      lid.ty = closedTop() + (api.open ? AWAY + 40 : 0); lid.t0 = still ? 0 : now + (api.open ? 0 : 520); if (still) lid.y = lid.ty;
      for (const c of callouts) { c.t0 = still ? 0 : now + 1100 + c.order * 130; if (still) c.p = api.open && api.lifted > c.it.layer ? 1 : 0; }
      kick();
    },
    highlight(it) { hot = it && it.group.visible ? it : null; kick(); },
    // 빼 보기: 이 부품들(과 그 위에 얹힌 것)을 위로 떠올려 치운다. 크기만 다시 센다는 뜻이고, 그려진 자리는 그대로 비워 둔다.
    // 빠진 것에 기대던 부품들. 어느 것이 무너지는지는 부르는 쪽이 의존 관계로 정해서 준다.
    setFallen(list) { fallen = new Set(list); for (const it of items) setDead(it, fell(it) && !gone(it)); api.place(); },
    setRemoved(list) { removed = new Set(list); if (hot && gone(hot)) hot = null; for (const it of items) if (it.off && !removed.has(it)) it.back = true; api.place(); }, // 되돌린 부품은 끌려 나간 자리에서 제자리로 돌아온다
  };
  function frame(dt, now) {
    const k = 1 - Math.exp(-dt * 7); let moving = false;
    for (const it of items) {
      if (it.y === undefined) it.y = it.ty;
      if (now < it.t0) moving = true;
      else if (it.y !== it.ty) { it.y += (it.ty - it.y) * k; if (Math.abs(it.ty - it.y) < 0.02) it.y = it.ty; else moving = true; }
      const lt = it === hot ? 1.6 : 0; if (it.lift !== lt) { it.lift += (lt - it.lift) * Math.min(1, k * 2.5); if (Math.abs(lt - it.lift) < 0.02) it.lift = lt; else moving = true; }
      // 끌려 나온 부품과 그 위에 얹힌 것은 끌린 만큼 옮겨 그린다. 놓고 돌아가는 중이면 조금씩 제자리로.
      if (it.back && it.off) { it.off.multiplyScalar(Math.max(0, 1 - k * 1.6)); if (it.off.lengthSq() < 0.01) { it.off = null; it.back = false; } else moving = true; }
      let o = null; for (let x = it; x && !o; x = x.parent) o = x.off || null;
      it.group.position.set(it.cx + (o ? o.x : 0), it.y + it.lift + (o ? o.y : 0), it.cz + (o ? o.z : 0)); it.group.visible = it.y < baseY(it.layer) + maxLayer * GAP + AWAY * 0.5;
    }
    if (now < lid.t0) moving = true; else if (lid.y !== lid.ty) { lid.y += (lid.ty - lid.y) * Math.min(1, k * 0.8); if (Math.abs(lid.ty - lid.y) < 0.02) lid.y = lid.ty; else moving = true; }
    lid.group.position.y = lid.y; lid.group.visible = lid.y < closedTop() + AWAY * 0.6;
    for (const c of callouts) {
      const live = api.open && api.lifted > c.it.layer && !gone(c.it) && !c.it.dead, want = live && now >= c.t0 ? 1 : 0;
      if (c.p !== want) { c.p += (want - c.p) * Math.min(1, dt * (want ? 2.6 : 9)); if (Math.abs(want - c.p) < 0.004) c.p = want; else moving = true; } else if (live && now < c.t0) moving = true;
      c.line.geometry.instanceCount = Math.floor(c.segs * clamp(c.p * 1.25, 0, 1)); c.line.visible = c.p > 0.01;
      const tail = clamp((c.p - 0.72) / 0.28, 0, 1); c.label.material.opacity = tail; c.pad.material.opacity = tail; c.label.visible = c.pad.visible = tail > 0;
      c.riser.visible = c.p > 0.02 && c.it.group.visible; c.riser.scale.y = Math.max(0.001, c.it.group.position.y - PLATE);
      if (snap && !snapKeep) c.line.visible = c.label.visible = c.pad.visible = c.riser.visible = false; // 공유 카드에는 회로선과 라벨을 넣지 않는다
    }
    if (hot) { outline.visible = true; outline.position.copy(hot.group.position); outline.position.y += hot.th / 2; outline.scale.copy(hot.mesh.scale).multiplyScalar(1.012); } else outline.visible = false;
    const top = Math.min(maxLayer, Math.max(1, api.lifted) - 1), tcy = (baseY(top) + TH[Math.min(top, 3)] + top * (api.open ? GAP : 0)) / 2;
    if (cy !== tcy) { cy += (tcy - cy) * k; if (Math.abs(tcy - cy) < 0.02) cy = tcy; else moving = true; }
    if (opts.drift && !touched && !reduced.matches && onScreen) { az = az0 + 0.12 * Math.sin(now / 1000 * 0.2); moving = true; }
    const R = 700; cam.position.set(R * Math.cos(el) * Math.sin(az), cy + R * Math.sin(el), R * Math.cos(el) * Math.cos(az)); cam.lookAt(0, cy, 0); cam.updateMatrixWorld();
    composer.render();
    return moving;
  }
  let running = false, last = 0, dragging = false, onScreen = true, dead = false, snap = false, snapKeep = false;
  function tick() { if (dead) return; if (api.manual) { running = false; return; } // manual: 스스로 돌지 않고 snapshot의 advance로만 진행한다
    const now = clock(), moving = frame(Math.min(0.05, (now - last) / 1000), now); last = now; if (moving || dragging || grab) next(); else running = false; }
  function next() { let done = false; const go = () => { if (!done) { done = true; tick(); } }; requestAnimationFrame(go); setTimeout(go, 80); } // 화면이 가려져 있어도 멈추지 않게
  function kick() { if (!running) { running = true; last = clock(); next(); } }
  api.settle = () => { api.place(true); for (const c of callouts) c.p = api.open ? 1 : 0; frame(1, clock()); frame(1, clock()); };

  let px = 0, py = 0;
  function pick(e) {
    const r = canvas.getBoundingClientRect(); ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, cam);
    const hit = ray.intersectObjects(items.filter(i => i.group.visible).map(i => i.mesh), false)[0]; return hit ? hit.object.userData.it : null;
  }
  function setHot(it, e) {
    if (lid.group.visible && !api.open) it = null;
    if (it !== hot) { hot = it; kick(); if (opts.onHover) opts.onHover(it); }
    tip.hidden = !it; if (it) { const r = host.getBoundingClientRect(), n = it.node; tip.textContent = `${n.n}\n${fmt(n.b)} · ${pct(n.b, data.total)}${opts.originWord ? " · " + opts.originWord(n) : ""}${opts.depText && opts.depText(n) ? "\n" + opts.depText(n) : ""}`; const tx = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8); tip.style.transform = `translate(${tx}px, ${e.clientY - r.top + 16}px)`; }
  }
  // 블록을 잡아 끌면 그 블록(과 그 위에 얹힌 것)이 따라온다. 충분히 멀리 끌어다 놓으면 빠지고(빼 보기), 가까이 놓으면 제자리로 돌아간다.
  // 빈 곳을 끌면 돌린다. 누르기만 해서는 아무 일도 일어나지 않는다. 터치에서는 블록을 잡지 않는다(돌리기와 화면 넘기기가 먼저다).
  let downX = 0, downY = 0, grab = null; const DROP = 70;
  canvas.addEventListener("pointerdown", e => {
    touched = true; px = downX = e.clientX; py = downY = e.clientY; canvas.setPointerCapture(e.pointerId); tip.hidden = true;
    const it = opts.onPick && api.open && e.pointerType !== "touch" ? pick(e) : null;
    if (it && it.layer >= 1) { grab = { it, far: false }; it.back = false; hot = it; } else dragging = true;
    canvas.classList.add("drag"); kick();
  });
  canvas.addEventListener("pointermove", e => {
    if (grab) {
      // 화면에서 끈 만큼을 카메라의 오른쪽·위쪽 방향으로 옮긴다(정사영이라 화소당 거리가 일정하다)
      const dx = e.clientX - downX, dy = e.clientY - downY, u = (cam.right - cam.left) / W;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      grab.it.off = right.multiplyScalar(dx * u).add(up.multiplyScalar(-dy * u)); grab.far = Math.hypot(dx, dy) >= DROP;
      tip.hidden = !(grab.far && opts.dropText);
      if (!tip.hidden) { const r = host.getBoundingClientRect(); tip.textContent = opts.dropText; tip.style.transform = `translate(${Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8)}px, ${e.clientY - r.top + 16}px)`; }
      kick();
    }
    else if (dragging) { az -= (e.clientX - px) * 0.008; el = clamp(el + (e.clientY - py) * 0.006, 0.2, 1.3); px = e.clientX; py = e.clientY; }
    else if (e.pointerType !== "touch") setHot(pick(e), e);
  });
  const end = () => {
    dragging = false; canvas.classList.remove("drag");
    if (grab) { const g = grab; grab = null; tip.hidden = true; if (g.far) opts.onPick(g.it); else if (g.it.off) g.it.back = true; kick(); }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", () => { if (grab) grab.far = false; end(); });
  canvas.addEventListener("pointerleave", e => { if (!dragging) setHot(null, e); });
  canvas.addEventListener("keydown", e => { const d = { ArrowLeft: [0.14, 0], ArrowRight: [-0.14, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key]; if (!d) return; e.preventDefault(); touched = true; az += d[0]; el = clamp(el + d[1], 0.2, 1.3); kick(); });
  const ro = new ResizeObserver(resize), io = new IntersectionObserver(es => { onScreen = es[0].isIntersecting; if (onScreen) kick(); });
  ro.observe(host); io.observe(host);
  // 공유 카드용 그림: 지금 보이는 각도와 열림 상태 그대로 w×h 화소로 한 번 그려 돌려준다. f는 카메라 틀(halfH, halfW, shiftX, shiftY).
  api.snapshot = (w, h, f = {}) => {
    const pr = renderer.getPixelRatio(), keepHot = hot; hot = null; snap = true; snapKeep = !!f.callouts; // f.callouts: 회로선과 라벨을 남긴다(README용 영상을 찍을 때 쓴다)
    renderer.setPixelRatio(1); composer.setPixelRatio(1); renderer.setSize(w, h, false); composer.setSize(w, h);
    const aspect = w / h, halfH = Math.max(f.halfH || 104, (f.halfW || 150) / aspect), halfW = halfH * aspect, sx = (f.shiftX || 0) * halfW, sy = (f.shiftY || 0) * halfH;
    cam.left = -halfW + sx; cam.right = halfW + sx; cam.top = halfH + sy; cam.bottom = -halfH + sy; cam.updateProjectionMatrix();
    for (const m of lineMats) m.resolution.set(w, h);
    frame(f.advance || 0, clock()); // advance: 이만큼(초) 움직임을 진행시킨 뒤 그린다
    const out = document.createElement("canvas"); out.width = w; out.height = h; out.getContext("2d").drawImage(canvas, 0, 0); // 그린 직후 같은 작업 안에서 옮겨야 화소가 남아 있다
    snap = false; hot = keepHot; renderer.setPixelRatio(pr); composer.setPixelRatio(pr); resize();
    return out;
  };
  // 새 결과를 그리기 전에 부른다. WebGL 문맥은 브라우저마다 개수 상한이 있다.
  api.dispose = () => {
    dead = true; ro.disconnect(); io.disconnect();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { if (m.map) m.map.dispose(); m.dispose(); } });
    if (composer.dispose) composer.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); tip.remove();
  };
  build(); api.place(true); resize();
  return api;
}
