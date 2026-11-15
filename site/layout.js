// 3D 분해도(viewer.js)와 2D 트리맵(flat.js)이 같이 쓰는 것: 결과 줄이기, 트리맵 배치, 표기 도우미.
// 두 보기가 같은 배치를 쓰므로 한 부품은 두 보기에서 같은 자리, 같은 면적 비율로 나온다.
export const KIND_LAYER = { app: 0, runtime: 1, library: 2, module: 3 };
export const INK = { "app-code": "app", "bundled-app-code": "app", library: "library", runtime: "runtime", asset: "asset", unidentified: "unid" };
export const hatched = o => o === "bundled-app-code" || o === "unidentified";
export const fmt = b => b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
export const pct = (b, t) => { const p = b / t * 100; return (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + "%"; };
export const short = n => n.includes("/") ? n.slice(n.lastIndexOf("/") + 1) : n;

// 결과 트리를 그릴 만큼으로 줄인다. 아주 작은 자식은 한 블록으로 묶고 합계는 그대로 둔다.
// 묶음의 이름은 moreLabel(개수)로 만든다. 줄인 노드의 src는 원래 노드를 가리킨다.
export function reduce(doc, moreLabel) {
  const total = doc.root.bytes, MIN = total * 0.00018, MAXKIDS = 90;
  const conv = n => {
    const out = { n: n.name, b: n.bytes, k: n.kind, src: n }; if (n.origin) out.o = n.origin;
    const kids = (n.children || []).filter(c => c.bytes > 0).sort((a, b) => b.bytes - a.bytes);
    if (!kids.length) return out;
    const keep = kids.filter((c, i) => c.bytes >= MIN && i < MAXKIDS), rest = kids.slice(keep.length);
    out.c = keep.map(conv);
    if (rest.length) {
      const by = new Map(); let sum = 0;
      for (const c of rest) { const key = c.kind + "|" + (c.origin || ""); by.set(key, (by.get(key) || 0) + c.bytes); sum += c.bytes; }
      const [kind, origin] = [...by].sort((a, b) => b[1] - a[1])[0][0].split("|");
      const lump = { n: moreLabel(rest.length), b: sum, k: kind === "container" ? "overhead" : kind, lump: true }; if (origin) lump.o = origin;
      out.c.push(lump);
    }
    return out;
  };
  return { total, root: conv(doc.root) };
}

// 정사각형에 가깝게 나누는 트리맵. 면적 = 바이트.
export function squarify(items, x, y, w, h) {
  const total = items.reduce((s, i) => s + i.b, 0); if (!total || w <= 0 || h <= 0) return;
  const scale = w * h / total; let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h); let n = 0, sum = 0, lo = Infinity, hi = 0, worst = Infinity;
    while (i + n < items.length) {
      const a = items[i + n].b * scale, s2 = sum + a, l2 = Math.min(lo, a), h2 = Math.max(hi, a);
      const wr = Math.max(side * side * h2 / (s2 * s2), s2 * s2 / (side * side * l2));
      if (n && wr > worst) break;
      sum = s2; lo = l2; hi = h2; worst = wr; n++;
    }
    const thick = sum / side; let off = 0;
    for (let j = 0; j < n; j++) { const it = items[i + j], len = it.b * scale / thick; it.rect = w >= h ? [x, y + off, thick, len] : [x + off, y, len, thick]; off += len; }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    i += n;
  }
}

// 배치: 노드마다 사각형과 층을 정한다. 묶음(container)은 그리지 않고 자리만 물려준다.
// 돌려주는 목록은 부모가 자식보다 먼저 온다.
export function layoutItems(data, W, H) {
  const items = [];
  (function place(node, rect, parentLayer, parent) {
    const drawn = node.k !== "container";
    const layer = drawn ? Math.max(KIND_LAYER[node.k] ?? 0, parentLayer + 1) : parentLayer;
    let me = parent;
    if (drawn) { me = { node, rect, layer, leaf: !node.c, parent }; items.push(me); }
    if (!node.c) return;
    const kids = node.c.slice().sort((a, b) => b.b - a.b);
    squarify(kids, rect[0], rect[1], rect[2], rect[3]);
    for (const k of kids) if (k.rect && k.rect[2] > 0.1 && k.rect[3] > 0.1) place(k, k.rect, drawn ? layer : parentLayer, me);
  })(data.root, [0, 0, W, H], -1, null);
  return items;
}
