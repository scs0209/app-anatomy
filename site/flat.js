// 좁은 화면용 2D 트리맵. 보기 전용이다: 돌리기, 층 단추, 열기·닫기가 없다.
// 면적 = 바이트, 색 = 출처, 빗금 = 안쪽을 모름. 배치는 3D 분해도와 같은 것을 쓴다(layout.js).
// three.js를 읽지 않으므로 좁은 화면은 3D 코드를 내려받지 않는다.
import { layoutItems, INK, hatched, fmt, pct, short } from "./layout.js";
export { reduce } from "./layout.js";

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const lum = hex => { const n = parseInt(hex.slice(1), 16), f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(n >> 16) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255); };

export function flat(host, data, opts = {}) {
  const PAD = 12, CAP = 46, UW = 100;
  const canvas = document.createElement("canvas"); canvas.className = "flat"; canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", opts.alt || "");
  const cap = document.createElement("p"); cap.className = "flatcap";
  host.append(canvas, cap);
  let g = canvas.getContext("2d");
  const BOARD = css("--board"), ICE = css("--ice"), TEXT = css("--text");
  const FONT = `"Archivo", "Pretendard Variable", sans-serif`, MONO = `"JetBrains Mono", monospace`;
  // 배치는 처음 한 번, 그때의 가로세로 비율로 정한다. 크기가 바뀌면 같은 배치를 늘려 그린다(부품의 참조가 바뀌지 않는다).
  let W = host.clientWidth || 1, H = host.clientHeight || 1;
  const UH = UW * Math.max(40, H - PAD * 2 - CAP) / Math.max(40, W - PAD * 2);
  const items = layoutItems(data, UW, UH), maxLayer = Math.max(0, ...items.map(i => i.layer));
  const bySrc = new Map(items.map(i => [i.node.src, i])), find = src => bySrc.get(src) || null;
  for (const it of items) {
    const o = it.node.o, structural = !it.leaf && (it.node.k === "app" || it.node.k === "runtime" || !o);
    it.hex = structural ? css("--substrate") : o ? css("--" + INK[o]) : css("--overhead"); it.hatch = !structural && hatched(o);
  }
  const patterns = {};
  function hatchFill(hex) { // 출처 색 바탕에 기판 색 빗금
    if (patterns[hex]) return patterns[hex];
    const c = document.createElement("canvas"); c.width = c.height = 8; const p = c.getContext("2d");
    p.fillStyle = hex; p.fillRect(0, 0, 8, 8); p.strokeStyle = BOARD; p.lineWidth = 1.6; p.lineCap = "square";
    for (const d of [-8, 0, 8]) { p.beginPath(); p.moveTo(d, 8); p.lineTo(d + 8, 0); p.stroke(); }
    return (patterns[hex] = g.createPattern(c, "repeat"));
  }
  const box = it => { const sx = (W - PAD * 2) / UW, sy = (H - PAD * 2 - CAP) / UH, [x, y, w, h] = it.rect; return [PAD + x * sx, PAD + y * sy, w * sx, h * sy]; };
  function fit(text, max) { if (g.measureText(text).width <= max) return text; while (text.length > 2 && g.measureText(text + "…").width > max) text = text.slice(0, -1); return text + "…"; }
  let hot = null, dead = false, removed = new Set();
  const gone = it => { for (let x = it; x; x = x.parent) if (removed.has(x)) return true; return false; };
  function draw() {
    if (dead) return;
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    const dpr = Math.min(devicePixelRatio || 1, 3); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    paint();
  }
  function paint() {
    // 부모가 먼저, 자식이 그 위에. 사이는 기판 색 1px 선으로 가른다.
    for (const it of items) {
      const [x, y, w, h] = box(it); if (w < 0.6 || h < 0.6) continue;
      g.globalAlpha = gone(it) ? 0.12 : 1;
      g.fillStyle = it.hatch ? hatchFill(it.hex) : it.hex; g.fillRect(x, y, w, h);
      if (w > 3 && h > 3) { g.strokeStyle = BOARD; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    }
    // 이름: 라이브러리 층의 부품과, 그보다 위에서 끝나는 부품에. 들어갈 자리가 있을 때만.
    g.textBaseline = "top";
    g.globalAlpha = 1;
    for (const it of items) {
      if (gone(it)) continue;
      const LL = opts.labelLayer ?? 2; if (it.layer < 1 || !(it.layer === LL || (it.leaf && it.layer < LL))) continue;
      const [x, y, w, h] = box(it); if (w < 58 || h < 24) continue;
      const dark = lum(it.hex) > 0.36, two = h >= 42;
      g.font = `700 12px ${FONT}`; const name = fit(short(it.node.n), w - 14), nw = g.measureText(name).width;
      g.font = `500 10.5px ${MONO}`; const sub = two ? fit(`${fmt(it.node.b)} ${pct(it.node.b, data.total)}`, w - 14) : "", sw = two ? g.measureText(sub).width : 0;
      // 안쪽이 더 나뉘었거나 빗금이면 글자 자리만 그 부품의 민색으로 깔아 선과 겹치지 않게 한다
      if (!it.leaf || it.hatch) { g.fillStyle = it.hex; g.fillRect(x + 2, y + 2, Math.min(w - 4, Math.max(nw, sw) + 10), two ? 36 : 20); }
      g.fillStyle = dark ? BOARD : TEXT;
      g.font = `700 12px ${FONT}`; g.fillText(name, x + 7, y + 7);
      if (two) { g.font = `500 10.5px ${MONO}`; g.fillText(sub, x + 7, y + 23); }
    }
    if (hot) { const [x, y, w, h] = box(hot); g.strokeStyle = ICE; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2)); }
  }
  function caption() {
    cap.textContent = "";
    if (!hot) { cap.textContent = opts.hint || ""; return; }
    const n = hot.node, name = document.createElement("b"), num = document.createElement("span");
    name.textContent = short(n.n); num.className = "num"; num.textContent = `${fmt(n.b)} · ${pct(n.b, data.total)}`;
    if (opts.swatch) cap.append(opts.swatch(n));
    cap.append(name, num); if (opts.originWord) cap.append(opts.originWord(n));
  }
  function setHot(it, fromUser) { if (it === hot) return; hot = it; draw(); caption(); if (fromUser && opts.onHover) opts.onHover(it); }
  function hit(e) {
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; let found = null;
    for (const it of items) { if (it.layer < 1) continue; const [x, y, w, h] = box(it); if (px >= x && px < x + w && py >= y && py < y + h) found = it; } // 뒤에 오는 것이 더 안쪽이다
    return found;
  }
  canvas.addEventListener("click", e => setHot(hit(e), true)); // 누르면 이름을 보인다. 빈 곳을 누르면 지운다.
  canvas.addEventListener("pointermove", e => { if (e.pointerType === "mouse") setHot(hit(e), true); });
  canvas.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") setHot(null, true); });
  const ro = new ResizeObserver(draw); ro.observe(host);
  const api = {
    items, total: data.total, layers: maxLayer + 1, lifted: maxLayer + 1, open: true, flat: true, find,
    place() { canvas.classList.toggle("away", !api.open); }, // 해석 중과 오류 화면에서는 흐리게 둔다
    settle() { api.place(); draw(); },
    highlight(it) { setHot(it || null, false); },
    setRemoved(list) { removed = new Set(list); draw(); }, // 빼 보기: 빠진 부품은 흐리게 남긴다
    // 공유 카드용 그림: w×h 자리에 여백과 설명 줄 없이 같은 트리맵을 그려 돌려준다. scale은 선명도(2면 두 배 화소).
    snapshot(w, h, scale = 2) {
      const out = document.createElement("canvas"), keep = [g, W, H, hot]; out.width = Math.round(w * scale); out.height = Math.round(h * scale);
      g = out.getContext("2d"); g.scale(scale, scale); g.translate(-PAD, -PAD); W = w + PAD * 2; H = h + PAD * 2 + CAP; hot = null;
      paint();
      [g, W, H, hot] = keep; return out;
    },
    dispose() { dead = true; ro.disconnect(); canvas.remove(); cap.remove(); },
  };
  caption(); draw();
  return api;
}
