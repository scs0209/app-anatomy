// 갤러리 목록을 만든다. 사용법: node site/gallery.mjs
// site/gallery/apps.json(손으로 적는 목록: 파일, 표시 이름, 버전, 플랫폼)과 그 옆의 결과 JSON을 읽어
// site/gallery/index.json(목록 화면이 읽는 요약)을 쓴다. 요약의 숫자는 모두 결과 JSON에서 계산한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "gallery");
const apps = JSON.parse(fs.readFileSync(path.join(dir, "apps.json"), "utf8")), out = [];
for (const a of apps) {
  const raw = fs.readFileSync(path.join(dir, a.file)), doc = JSON.parse(raw);
  // 출처별 바이트: 자식이 없는 노드만 더한다. 합이 전체와 같아야 한다.
  const by = {}; let sum = 0;
  (function walk(n) { if (n.children && n.children.length) return n.children.forEach(walk); const k = n.origin || "overhead"; by[k] = (by[k] || 0) + n.bytes; sum += n.bytes; })(doc.root);
  const total = doc.completeness.totalBytes;
  if (sum !== total) throw new Error(`${a.file}: 잎의 합 ${sum} 이 전체 ${total} 과 다르다`);
  out.push({ ...a, bytes: total, fileBytes: raw.length, runtimes: doc.runtimes.map(r => ({ runtime: r.runtime, dissected: r.dissected })), origins: by, toolVersion: doc.toolVersion });
  console.log(a.file.padEnd(26), String(total).padStart(11), Object.entries(by).map(([k, v]) => `${k} ${(100 * v / total).toFixed(1)}%`).join("  "));
}
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(out));
console.log(out.length, "apps");
