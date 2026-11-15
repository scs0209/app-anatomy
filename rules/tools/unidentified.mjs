#!/usr/bin/env node
// 결과에서 못 알아본 부품을 큰 순서로 보인다. 규칙을 쓸 곳을 찾는 데 쓴다.
//   node rules/tools/unidentified.mjs <결과.json 또는 앱 파일> [--top <개수>]
// 앱 파일(.app, ZIP, APK, IPA)을 주면 먼저 해석한다. 같은 이름은 한 줄로 합친다(여러 ABI에 든 같은 라이브러리).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2); let input = null, top = 25;
for (let i = 0; i < args.length; i++) { if (args[i] === "--top") top = Number(args[++i]) || 25; else input = args[i]; }
if (!input) { console.error("usage: node rules/tools/unidentified.mjs <result.json | app file> [--top <n>]"); process.exit(2); }
let file = input, tmp = null;
if (!/\.json$/i.test(input)) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anatomy-unid-")); file = path.join(tmp, "result.json");
  const r = spawnSync(process.execPath, [path.join(root, "cli/anatomy.mjs"), input, "--json", file, "--no-hash"], { encoding: "utf8" });
  if (r.status !== 0) { console.error((r.stderr || "").trim()); process.exit(r.status || 4); }
}
const doc = JSON.parse(fs.readFileSync(file, "utf8")); if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
const T = doc.completeness.totalBytes, by = new Map();
(function walk(n, parents) {
  const kids = n.children || [];
  // 못 알아본 것 가운데 가장 바깥의 것을 센다: 그 안쪽은 같은 이유로 못 알아본 것이다
  if (n.origin === "unidentified") { const g = by.get(n.name) || { bytes: 0, count: 0, kind: n.kind, where: parents.slice(-2).join(" > ") }; g.bytes += n.bytes; g.count++; by.set(n.name, g); return; }
  for (const c of kids) walk(c, parents.concat(n.name));
})(doc.root, []);
const list = [...by].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.bytes - a.bytes);
const fmt = b => b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : (b / 1e3).toFixed(1) + " KB";
// 어떤 조건으로 잡을 수 있을지 짐작해 준다. 짐작일 뿐이다: 그 이름이 정말 그 라이브러리의 것인지는 사람이 확인한다.
const hint = x => /^lib.+\.so$/.test(x.name) ? `file-name literal "${x.name}"` : /\.framework$/.test(x.name) ? `framework-name literal "${x.name.replace(/\.framework$/, "")}"` : /\.(dylib|so)$/.test(x.name) ? `file-name literal "${path.basename(x.name)}"` : "";
console.log(`${doc.input.name}: ${fmt(doc.completeness.unidentifiedBytes)} unidentified of ${fmt(T)} (${(100 * doc.completeness.unidentifiedBytes / T).toFixed(1)}%), ${list.length} distinct names\n`);
for (const x of list.slice(0, top)) console.log(`${fmt(x.bytes).padStart(10)}  ${(100 * x.bytes / T).toFixed(1).padStart(5)}%  ${x.count > 1 ? "×" + x.count + " " : ""}${x.name}${x.where ? "   (in " + x.where + ")" : ""}${hint(x) ? "\n" + " ".repeat(21) + "try: " + hint(x) : ""}`);
