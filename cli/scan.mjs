#!/usr/bin/env node
// 이 맥에 설치된 앱을 모두 훑어 하나의 결과로 만든다.
//   node cli/scan.mjs [폴더…] [--out <파일>] [--system] [--quiet] [--open]
//   --open 은 끝난 뒤 결과를 브라우저로 보인다(이 기기에서만 열리는 주소로 띄운다).
//   폴더를 주지 않으면 /Applications 와 ~/Applications 를 훑는다. --system 은 /System/Applications 도 넣는다.
// 앱을 실행하지 않는다. 파일 목록과 크기, 그리고 해석기가 식별에 쓰는 일부 바이트만 읽는다. 네트워크를 쓰지 않는다.
// 결과 파일에는 이 기기에 설치된 앱의 이름과 버전이 들어 있다. 사이트에 놓으면 그 탭 안에서만 그려지고 어디로도 가지 않는다.
// 결과는 한 앱의 결과와 같은 형식이다(schemaVersion 1). 뿌리가 "이 맥"이고 그 자식이 앱들이다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCore, INPUT_FOLDER } from "../host/loader.mjs";
import { folderSource } from "../host/node-host.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), dirs = []; let out = "this-mac.anatomy-scan.json", system = false, quiet = false, open = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") out = args[++i]; else if (a === "--system") system = true; else if (a === "--quiet") quiet = true; else if (a === "--open") open = true;
  else if (a === "--help" || a === "-h") { console.log("usage: app-anatomy scan [dir]... [--out <file>] [--system] [--quiet] [--open]\n  default folders: /Applications and ~/Applications. --system adds /System/Applications.\n  --open shows the result in your browser, served from this machine only."); process.exit(0); }
  else if (a.startsWith("--")) { console.error("unknown option " + a); process.exit(2); }
  else dirs.push(path.resolve(a));
}
if (!dirs.length) { dirs.push("/Applications", path.join(os.homedir(), "Applications")); if (system) dirs.push("/System/Applications"); }
const fmt = b => b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : (b / 1e6).toFixed(1) + " MB";

// 앱 찾기: 각 폴더의 *.app 과, 한 단계 아래 폴더(예: Utilities)의 *.app
const apps = [];
for (const d of dirs) {
  let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
  for (const e of list) {
    const p = path.join(d, e.name);
    if (e.name.endsWith(".app") && e.isDirectory()) apps.push(p);
    else if (e.isDirectory() && !e.name.startsWith(".")) {
      try { for (const f of fs.readdirSync(p, { withFileTypes: true })) if (f.name.endsWith(".app") && f.isDirectory()) apps.push(path.join(p, f.name)); } catch { /* 읽을 수 없는 폴더는 건너뛴다 */ }
    }
  }
}
if (!apps.length) { console.error("no .app found in: " + dirs.join(", ")); process.exit(3); }

const module = await WebAssembly.compile(fs.readFileSync(path.join(root, "dist/anatomy_core.wasm")));
const rules = [];
for (const dir of ["rules/builtin", "rules/imported"]) { const d = path.join(root, dir); if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith(".json")) rules.push(fs.readFileSync(path.join(d, f))); }

const docs = [], skipped = [], t0 = Date.now();
for (const [i, app] of apps.sort((a, b) => path.basename(a).localeCompare(path.basename(b))).entries()) {
  const name = path.basename(app); let src = null;
  try {
    src = folderSource(app);
    const core = createCore(module, src);
    for (const r of rules) { const x = core.addRules(r); if (!x.ok) throw new Error(x.error.code + ": " + x.error.message); }
    const r = core.analyze(INPUT_FOLDER, { deadlineMs: 60000, maxNodes: 1000000, inputName: name });
    if (!r.ok) throw new Error(r.error.code + ": " + r.error.message);
    const doc = JSON.parse(new TextDecoder().decode(r.bytes));
    docs.push(doc);
    if (!quiet) console.log(`${String(i + 1).padStart(3)}/${apps.length} ${name.padEnd(36).slice(0, 36)} ${fmt(doc.completeness.totalBytes).padStart(10)}  ${doc.runtimes.map(x => x.runtime).join("+")}`);
  } catch (e) {
    const reason = String(e && e.message || e).split("\n")[0].slice(0, 160);
    skipped.push({ name, reason }); if (!quiet) console.log(`${String(i + 1).padStart(3)}/${apps.length} ${name.padEnd(36).slice(0, 36)} skipped: ${reason}`);
  } finally { if (src) try { src.close(); } catch { /* 이미 닫혔다 */ } }
}
if (!docs.length) { console.error("no app could be analyzed"); process.exit(4); }

// 합친 결과가 다룰 만한 크기가 되도록 줄인다. 아주 작은 자식은 출처별로 한 줄씩 묶는다(출처별 바이트는 그대로다).
const total = docs.reduce((s, d) => s + d.completeness.totalBytes, 0), MIN = total * 0.00005, MAXKIDS = 80;
function prune(n) {
  const kids = (n.children || []).filter(c => c.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  if (!kids.length) { if (n.children) delete n.children; return n; }
  const keep = kids.filter((c, i) => c.bytes >= MIN && i < MAXKIDS), rest = kids.slice(keep.length), by = new Map();
  for (const c of rest) (function leaves(x) { // 묶을 때는 잎까지 내려가 출처별로 더한다
    if (x.children && x.children.length) return x.children.forEach(leaves);
    const key = x.origin || (x.kind === "shared" ? "shared" : "overhead"), g = by.get(key) || { bytes: 0, count: 0 }; g.bytes += x.bytes; g.count++; by.set(key, g);
  })(c);
  n.children = keep.map(prune);
  for (const [key, g] of [...by].sort((a, b) => b[1].bytes - a[1].bytes)) {
    if (!g.bytes) continue;
    const lump = { kind: key === "overhead" || key === "shared" ? key : "library", name: `(${g.count} small parts)`, bytes: g.bytes, lumped: g.count };
    if (key !== "overhead" && key !== "shared") lump.origin = key;
    n.children.push(lump);
  }
  return n;
}
const sum = k => docs.reduce((s, d) => s + (d.completeness[k] || 0), 0), byRt = new Map();
for (const d of docs) for (const r of d.runtimes) { const g = byRt.get(r.runtime) || { runtime: r.runtime, dissected: true, bytes: 0, apps: 0, appBytes: 0 }; g.bytes += r.bytes || 0; g.apps++; g.appBytes += d.completeness.totalBytes; g.dissected = g.dissected && r.dissected; byRt.set(r.runtime, g); }
const result = {
  schemaVersion: 1, toolVersion: docs[0].toolVersion, rulesVersion: docs[0].rulesVersion,
  input: { packaging: "scan", name: "This Mac", approximate: false },
  runtimes: [...byRt.values()].sort((a, b) => b.appBytes - a.appBytes),
  completeness: { totalBytes: total, unidentifiedBytes: sum("unidentifiedBytes"), opaqueBytes: sum("opaqueBytes"), overheadBytes: sum("overheadBytes"), sharedBytes: sum("sharedBytes"), parseFailedNodes: sum("parseFailedNodes") },
  copies: [], warnings: [],
  scan: {
    folders: dirs.map(d => d.replace(os.homedir(), "~")), // 홈 폴더 경로(사용자 이름)는 넣지 않는다
    apps: docs.map(d => ({ name: d.input.name, appVersion: d.input.appVersion || null, runtimes: d.runtimes.map(r => r.runtime), bytes: d.completeness.totalBytes })).sort((a, b) => b.bytes - a.bytes),
    skipped,
  },
  root: { kind: "app", name: "This Mac", bytes: total, children: docs.map(d => prune(d.root)).sort((a, b) => b.bytes - a.bytes) },
};
// 줄인 뒤에도 잎의 합이 전체와 같아야 한다
let leafSum = 0; (function walk(n) { if (n.children && n.children.length) return n.children.forEach(walk); leafSum += n.bytes; })(result.root);
if (leafSum !== total) { console.error(`internal error: leaf bytes ${leafSum} differ from total ${total}`); process.exit(4); }
fs.writeFileSync(out, JSON.stringify(result));
console.log(`\n${docs.length} apps, ${fmt(total)} uncompressed, ${((Date.now() - t0) / 1000).toFixed(1)} s${skipped.length ? `, ${skipped.length} skipped` : ""}`);
for (const r of result.runtimes) console.log(`  ${r.runtime.padEnd(14)} ${String(r.apps).padStart(3)} apps  ${fmt(r.appBytes).padStart(10)}`);
console.log(`wrote ${out} (${fmt(fs.statSync(out).size)}). It lists the apps installed on this Mac: share it only if you mean to.`);
if (open) { const { serve } = await import("./serve.mjs"); await serve({ scan: path.resolve(out) }); }
