// 공유 카드: 1200×630 PNG. 이 탭 안에서 캔버스로 그리며 어디로도 보내지 않는다.
// 넓은 화면에서는 지금 보이는 3D 칩(각도와 열림 상태 그대로)이, 좁은 화면에서는 2D 트리맵이 들어간다.
// 디자인 값은 DESIGN.md를 따른다: 어두운 기판, 출처 색 넷, 얼음색 귀퉁이 표시.
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const W = 1200, H = 630, M = 56;
const FONT = `"Archivo", "Pretendard Variable", sans-serif`, MONO = `"JetBrains Mono", monospace`;

// info: { name, version, runtime, meta, parts: [{ name, word, pct, ink, hatch }], legend: [{ word, ink, hatch }] }
// view: 지금 떠 있는 보기(viewer.js의 chip 또는 flat.js의 flat). 없으면 그림 없이 글만 넣는다.
export function drawCard(info, view) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), BOARD = css("--board"), BOARD2 = css("--board-2"), ICE = css("--ice"), TEXT = css("--text"), SOFT = css("--soft"), RULE = css("--rule");
  const ink = k => css("--" + (k || "overhead"));
  const fit = (text, max) => { if (g.measureText(text).width <= max) return text; while (text.length > 2 && g.measureText(text + "…").width > max) text = text.slice(0, -1); return text + "…"; };
  const swatch = (x, y, w, h, p) => {
    g.fillStyle = ink(p.ink); g.fillRect(x, y, w, h);
    if (p.hatch) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = BOARD; g.lineWidth = 2; for (let d = -h; d < w; d += 6) { g.beginPath(); g.moveTo(x + d, y + h); g.lineTo(x + d + h, y); g.stroke(); } g.restore(); }
  };
  g.fillStyle = BOARD; g.fillRect(0, 0, W, H);

  // 그림
  const flat = view && view.flat, has = view && view.snapshot;
  if (has && !flat) {
    // 3D: 카드 전체가 기판이고 칩은 오른쪽에 놓인다. 두 배로 그려 줄여 넣는다.
    g.drawImage(view.snapshot(W * 2, H * 2, { halfH: 90, halfW: 150, shiftX: -0.36, shiftY: -0.1 }), 0, 0, W, H);
    const fade = g.createLinearGradient(0, 0, 640, 0); fade.addColorStop(0, BOARD); fade.addColorStop(0.62, BOARD); fade.addColorStop(1, "rgba(10,13,16,0)");
    g.fillStyle = fade; g.fillRect(0, 0, 640, H);
  } else {
    // 2D 또는 그림 없음: 옅은 격자점을 깔고 오른쪽에 트리맵 판을 놓는다
    g.fillStyle = css("--grid"); for (let x = 24; x < W; x += 48) for (let y = 27; y < H; y += 48) g.fillRect(x, y, 2, 2);
    if (has) { const x = 580, y = 64, w = 564, h = 502; g.fillStyle = BOARD2; g.fillRect(x - 10, y - 10, w + 20, h + 20); g.drawImage(view.snapshot(w, h, 2), x, y, w, h); }
  }

  // 글
  g.textBaseline = "alphabetic"; g.fillStyle = TEXT;
  if ("letterSpacing" in g) g.letterSpacing = "0.6px";
  g.font = `700 semi-expanded 15px ${FONT}`; g.fillText("APP ANATOMY", M, 74);
  if ("letterSpacing" in g) g.letterSpacing = "-0.6px";
  const maxW = has ? 500 : W - M * 2; let size = 68;
  do { g.font = `800 semi-expanded ${size}px ${FONT}`; size -= 4; } while (g.measureText(info.name).width > maxW && size >= 34);
  g.fillText(fit(info.name, maxW), M, 164);
  if ("letterSpacing" in g) g.letterSpacing = "0px";
  g.font = `600 22px ${FONT}`; g.fillText(fit([info.runtime, info.version].filter(Boolean).join(" · "), maxW), M, 204);
  g.fillStyle = SOFT; g.font = `500 15px ${MONO}`; g.fillText(fit(info.meta, maxW), M, 234);
  g.fillStyle = RULE; g.fillRect(M, 258, Math.min(maxW, 440), 1);
  // 큰 부품: 색 조각, 이름, 출처를 말로, 비율
  let y = 296; const right = M + Math.min(maxW, 440);
  for (const p of info.parts.slice(0, 5)) {
    swatch(M, y - 12, 22, 13, p);
    g.fillStyle = SOFT; g.font = `500 16px ${MONO}`; const pw = g.measureText(p.pct).width; g.fillText(p.pct, right - pw, y);
    g.fillStyle = TEXT; g.font = `600 18px ${FONT}`; g.fillText(fit(p.name, right - pw - M - 52), M + 36, y);
    g.fillStyle = SOFT; g.font = `400 13px ${FONT}`; g.fillText(p.word, M + 36, y + 19);
    y += 50;
  }
  // 범례: 색이 무엇을 뜻하는지 카드만 보고도 알 수 있게
  let x = M; g.font = `400 13px ${FONT}`;
  for (const l of info.legend) { swatch(x, H - 62, 18, 11, l); g.fillStyle = SOFT; g.fillText(l.word, x + 26, H - 52); x += 26 + g.measureText(l.word).width + 20; }
  // 네 귀퉁이 표시
  g.strokeStyle = ICE; g.lineWidth = 2; const t = 18, a = 22, b = W - 22, d = H - 22;
  for (const [px, py, dx, dy] of [[a, a, 1, 1], [b, a, -1, 1], [a, d, 1, -1], [b, d, -1, -1]]) { g.beginPath(); g.moveTo(px + dx * t, py); g.lineTo(px, py); g.lineTo(px, py + dy * t); g.stroke(); }
  return c;
}
